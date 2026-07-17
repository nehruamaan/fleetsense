import { describe, it, expect } from "vitest";
import { applyHardOverride, degradedResult } from "../../lib/exceptions-llm";
import type { ExceptionCandidate } from "../../lib/exceptions";
import type { ExceptionAgentResult } from "../../lib/exceptions-llm";

const dwellCandidate: ExceptionCandidate = {
  type: "DWELL",
  magnitude: "stopped 2h30m, 12mi off planned route",
  durationMinutes: 150,
};

const shortDwellCandidate: ExceptionCandidate = {
  type: "DWELL",
  magnitude: "stopped 45m, 2mi off planned route",
  durationMinutes: 45,
};

const etaSlipCandidate: ExceptionCandidate = {
  type: "ETA_SLIP",
  magnitude: "projected 3h late",
};

function llmResult(overrides: Partial<ExceptionAgentResult>): ExceptionAgentResult {
  return {
    likelyCause: "Traffic delay",
    priority: "LOW",
    draftDriverMessage: "Checking in on your ETA",
    draftCustomerMessage: null,
    confidence: "medium",
    ...overrides,
  };
}

describe("applyHardOverride", () => {
  it("forces HIGH priority for a long dwell, even if the model said LOW", () => {
    const result = applyHardOverride(dwellCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("HIGH");
  });

  it("does not override a short dwell below the breakdown threshold", () => {
    const result = applyHardOverride(shortDwellCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("LOW");
  });

  it("does not override a non-DWELL exception type regardless of duration", () => {
    const result = applyHardOverride(etaSlipCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("LOW");
  });

  it("preserves the model's other fields when overriding priority", () => {
    const result = applyHardOverride(dwellCandidate, llmResult({ likelyCause: "Possible breakdown", priority: "MED" }));
    expect(result.priority).toBe("HIGH");
    expect(result.likelyCause).toBe("Possible breakdown");
  });
});

describe("degradedResult", () => {
  it("still forces HIGH for a long dwell even without a real LLM call", () => {
    const result = degradedResult(dwellCandidate);
    expect(result.priority).toBe("HIGH");
    expect(result.confidence).toBe("low");
  });

  it("defaults to MED for a non-breakdown-pattern exception with no LLM available", () => {
    const result = degradedResult(etaSlipCandidate);
    expect(result.priority).toBe("MED");
  });
});
