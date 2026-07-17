import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ZodType } from "zod";

const MODEL_NAME = "gemini-2.5-flash";

let client: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!client) {
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

// Thrown when the model fails to produce schema-valid JSON after one retry.
// Callers must catch this and fall back to a deterministic-only result —
// never let a raw LLM failure surface as a broken UI.
export class LLMFallbackError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LLMFallbackError";
  }
}

export interface CallLLMOptions {
  systemPrompt: string;
  userPrompt: string;
  /** Base64-encoded images for multimodal (vision) calls, e.g. document extraction. */
  images?: { data: string; mimeType: string }[];
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

async function requestOnce(options: CallLLMOptions): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [
    { text: options.userPrompt },
  ];
  for (const image of options.images ?? []) {
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
    systemInstruction: options.systemPrompt,
  });

  return result.response.text();
}

/**
 * Thin wrapper around every LLM call in the app: sends the prompt, validates
 * the response against a Zod schema, retries once on malformed output, and
 * throws LLMFallbackError on repeated failure so callers apply their
 * deterministic fallback (per spec section 7 — no LLM output ever executes
 * an action directly, and the UI must never break on a bad response).
 */
export async function callLLM<T>(options: CallLLMOptions, schema: ZodType<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await requestOnce(options);
      console.log(`[LLM call] attempt=${attempt + 1}\nprompt=${options.userPrompt}\nresponse=${raw}`);

      const parsed = extractJson(raw);
      const validated = schema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err;
      console.error(`[LLM call] attempt=${attempt + 1} failed:`, err);
    }
  }

  throw new LLMFallbackError("LLM call failed after retry; use deterministic fallback", lastError);
}
