import { describe, it, expect } from "vitest";
import { reconcile, resolveChargeDecision } from "../../lib/reconciliation";

describe("reconcile", () => {
  it("returns zero delta when amounts match", () => {
    expect(reconcile(890, 890)).toEqual({ delta: 0 });
  });

  it("returns a positive delta when the invoice exceeds the rate con", () => {
    expect(reconcile(760, 910)).toEqual({ delta: 150 });
  });

  it("returns a negative delta when the invoice is under the rate con", () => {
    expect(reconcile(640, 600)).toEqual({ delta: -40 });
  });
});

describe("resolveChargeDecision", () => {
  it("adds the charge only when legitimate AND supported", () => {
    const result = resolveChargeDecision("legitimate_accessorial", true);
    expect(result.addCharge).toBe(true);
  });

  it("refuses to add the charge when legitimate but unsupported -- the hallucination guard", () => {
    const result = resolveChargeDecision("legitimate_accessorial", false);
    expect(result.addCharge).toBe(false);
    expect(result.reason).toMatch(/no supporting document/i);
  });

  it("refuses to add the charge when likely an error, even if supported", () => {
    expect(resolveChargeDecision("likely_error", true).addCharge).toBe(false);
  });

  it("refuses to add the charge when uncertain, even if supported", () => {
    expect(resolveChargeDecision("uncertain", true).addCharge).toBe(false);
  });
});
