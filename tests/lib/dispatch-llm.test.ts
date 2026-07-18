import { describe, it, expect } from "vitest";
import { validateRecommendation } from "../../lib/dispatch-llm";

describe("validateRecommendation", () => {
  const base = {
    rankedDriverIds: ["a", "b", "c"],
    recommendedDriverId: "a",
    rationale: "test rationale",
    tieFlag: false,
    confidence: "high" as const,
  };

  it("accepts a recommendation entirely within the allowed set", () => {
    expect(validateRecommendation(base, ["a", "b", "c"])).toEqual(base);
  });

  it("rejects a recommendedDriverId outside the allowed set", () => {
    expect(validateRecommendation({ ...base, recommendedDriverId: "z" }, ["a", "b", "c"])).toBeNull();
  });

  it("rejects when rankedDriverIds includes an id outside the allowed set", () => {
    expect(
      validateRecommendation({ ...base, rankedDriverIds: ["a", "b", "z"] }, ["a", "b", "c"])
    ).toBeNull();
  });
});
