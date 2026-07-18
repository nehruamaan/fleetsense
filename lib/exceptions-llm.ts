import { z } from "zod";
import { callLLM, LLMFallbackError } from "./llm";
import { DWELL_BREAKDOWN_THRESHOLD_MINUTES, type ExceptionCandidate } from "./exceptions";
import type { Load } from "@/app/generated/prisma/client";

export const ExceptionAgentSchema = z.object({
  likelyCause: z.string(),
  priority: z.enum(["HIGH", "MED", "LOW"]),
  draftDriverMessage: z.string().nullable(),
  draftCustomerMessage: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ExceptionAgentResult = z.infer<typeof ExceptionAgentSchema>;

const SYSTEM_PROMPT = `A truck has triggered an exception during transit. Explain the
likely cause in plain language for a dispatcher, and draft a short
check-in message to the driver (or an ETA update to the customer, if
it's a delay). If you cannot determine a likely cause with reasonable
confidence, say so honestly rather than guessing — return "unexplained
deviation" as the cause. Return ONLY valid JSON:
{ "likelyCause": string, "priority": "HIGH"|"MED"|"LOW",
  "draftDriverMessage": string|null, "draftCustomerMessage": string|null,
  "confidence": "high"|"medium"|"low" }`;

// Spec §6 hard rule: a prolonged off-route dwell is a possible-breakdown
// signature. Priority is forced to HIGH regardless of what the model said,
// on both the success path (applyHardOverride) and the fallback path
// (degradedResult) -- a down API must not weaken this. Both functions
// share this single predicate so the two paths can never silently diverge.
function isBreakdownDwell(candidate: ExceptionCandidate): boolean {
  return (
    candidate.type === "DWELL" &&
    candidate.durationMinutes !== undefined &&
    candidate.durationMinutes >= DWELL_BREAKDOWN_THRESHOLD_MINUTES
  );
}

export function applyHardOverride(
  candidate: ExceptionCandidate,
  raw: ExceptionAgentResult
): ExceptionAgentResult {
  if (isBreakdownDwell(candidate)) {
    return { ...raw, priority: "HIGH" };
  }
  return raw;
}

export function degradedResult(candidate: ExceptionCandidate): ExceptionAgentResult {
  return {
    likelyCause: "Unable to determine — AI analysis unavailable, deterministic detection only.",
    priority: isBreakdownDwell(candidate) ? "HIGH" : "MED",
    draftDriverMessage: null,
    draftCustomerMessage: null,
    confidence: "low",
  };
}

export async function getExceptionRead(
  load: Load,
  candidate: ExceptionCandidate
): Promise<{ result: ExceptionAgentResult; degraded: boolean }> {
  const userPrompt = `Exception type: ${candidate.type}. Load: ${load.origin} to ${load.destination}.
Detected: ${candidate.magnitude}.
Planned ETA: ${load.plannedETA ? load.plannedETA.toISOString() : "not set"}. Current time: ${new Date().toISOString()}.`;

  try {
    const raw = await callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt }, ExceptionAgentSchema);
    return { result: applyHardOverride(candidate, raw), degraded: false };
  } catch (err) {
    if (err instanceof LLMFallbackError) {
      return { result: degradedResult(candidate), degraded: true };
    }
    throw err;
  }
}
