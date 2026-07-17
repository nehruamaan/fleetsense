import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { z } from "zod";
import { callLLM, LLMFallbackError } from "../lib/llm";

async function verifySuccessPath() {
  console.log("\n=== Success path: well-formed schema/prompt ===");
  const schema = z.object({
    greeting: z.string(),
    number: z.number(),
  });

  const result = await callLLM(
    {
      systemPrompt: "You are a test endpoint. Return ONLY valid JSON matching the given schema.",
      userPrompt:
        'Return JSON: { "greeting": a short friendly greeting string, "number": the number 42 }',
    },
    schema
  );

  console.log("Round-trip succeeded. Parsed + validated result:", result);
  if (result.number !== 42) {
    throw new Error(`Expected number 42, got ${result.number}`);
  }
}

async function verifyFallbackPath() {
  console.log("\n=== Fallback path: schema the model cannot satisfy ===");
  // Impossible to satisfy honestly: forces literal values no real completion will produce,
  // so schema.parse() fails on both attempts and callLLM must throw LLMFallbackError.
  const impossibleSchema = z.object({
    mustBeExactly: z.literal("xkq7-impossible-sentinel-9f3a"),
  });

  try {
    await callLLM(
      {
        systemPrompt: "Return ONLY valid JSON matching the given schema.",
        userPrompt: 'Return JSON: { "status": "ok" }',
      },
      impossibleSchema
    );
    throw new Error("Expected callLLM to throw LLMFallbackError, but it resolved successfully.");
  } catch (err) {
    if (err instanceof LLMFallbackError) {
      console.log("Correctly fell back after retry exhaustion:", err.message);
    } else {
      throw err;
    }
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in .env.local — cannot run a real round trip.");
    process.exit(1);
  }

  await verifySuccessPath();
  await verifyFallbackPath();
  console.log("\nLLM wrapper verified: success path and fallback path both behave correctly.");
}

main().catch((err) => {
  console.error("\nVerification FAILED:", err);
  process.exitCode = 1;
});
