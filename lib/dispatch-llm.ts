import { z } from "zod";
import { callLLM, LLMFallbackError } from "./llm";
import type { Load } from "@/app/generated/prisma/client";
import type { ScoredDriver } from "./dispatch";

export const RankedDispatchSchema = z.object({
  rankedDriverIds: z.array(z.string()),
  recommendedDriverId: z.string(),
  rationale: z.string(),
  tieFlag: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RankedDispatchLLMResult = z.infer<typeof RankedDispatchSchema>;
export type DispatchRecommendationResult = RankedDispatchLLMResult & { degraded: boolean };

// Spec §4 hard rule: the LLM may only recommend one of the 3 drivers it was
// actually given. A model that names an unknown id is treated exactly like
// a schema-validation failure, never trusted past this check.
export function validateRecommendation(
  raw: RankedDispatchLLMResult,
  allowedDriverIds: string[]
): RankedDispatchLLMResult | null {
  const allowed = new Set(allowedDriverIds);
  if (!allowed.has(raw.recommendedDriverId)) return null;
  if (!raw.rankedDriverIds.every((id) => allowed.has(id))) return null;
  return raw;
}

function buildPrompt(load: Load, candidates: ScoredDriver[]) {
  const system = `You are helping a truck dispatcher choose the best driver for a load.
You will be given 3 pre-filtered, HOS-eligible drivers with computed stats,
plus their free-text notes/preferences if any. Rank them and recommend one.
If a driver has notes that suggest they shouldn't take this load (bad lane
history, stated preference against it) even if they're cheapest, factor
that in and explain why. Return ONLY valid JSON matching this schema:
{ "rankedDriverIds": [string], "recommendedDriverId": string,
  "rationale": string (2-3 sentences, plain language),
  "tieFlag": boolean, "confidence": "high"|"medium"|"low" }`;

  const candidateLines = candidates
    .map(
      (c, i) =>
        `${i + 1}. Driver ${c.driverId}: HOS remaining ${Math.round(
          c.driver.hosRemainingMinutes / 60
        )}h, deadhead ${Math.round(c.deadheadMiles)}mi, fuel cost $${c.fuelCost.toFixed(2)}, tomorrow-conflict: ${
          c.tomorrowConflict
        }, notes: "${c.driver.notes || "none"}"`
    )
    .join("\n");

  const user = `Load: ${load.origin} to ${load.destination}, pickup ${load.pickupWindow}, equipment ${load.equipmentRequired}.
Candidates:
${candidateLines}`;

  return { system, user };
}

function degradedResult(candidates: ScoredDriver[]): DispatchRecommendationResult {
  const top1 = candidates[0];
  return {
    rankedDriverIds: candidates.map((c) => c.driverId),
    recommendedDriverId: top1.driverId,
    rationale: "",
    tieFlag: false,
    confidence: "low",
    degraded: true,
  };
}

export async function getDispatchRecommendation(
  load: Load,
  candidates: ScoredDriver[]
): Promise<DispatchRecommendationResult> {
  const { system, user } = buildPrompt(load, candidates);
  const allowedIds = candidates.map((c) => c.driverId);

  try {
    const raw = await callLLM({ systemPrompt: system, userPrompt: user }, RankedDispatchSchema);
    const validated = validateRecommendation(raw, allowedIds);
    if (!validated) return degradedResult(candidates);
    return { ...validated, degraded: false };
  } catch (err) {
    if (err instanceof LLMFallbackError) return degradedResult(candidates);
    throw err;
  }
}
