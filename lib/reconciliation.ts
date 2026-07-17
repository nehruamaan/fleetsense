export function reconcile(rateConAmount: number, invoiceAmount: number): { delta: number } {
  return { delta: Math.round((invoiceAmount - rateConAmount) * 100) / 100 };
}

export type DiscrepancyClassification = "legitimate_accessorial" | "likely_error" | "uncertain";

export function resolveChargeDecision(
  classification: DiscrepancyClassification,
  hasSupportingDoc: boolean
): { addCharge: boolean; reason: string } {
  if (classification === "legitimate_accessorial" && hasSupportingDoc) {
    return {
      addCharge: true,
      reason: "Legitimate accessorial charge with a supporting document on file.",
    };
  }
  if (classification === "legitimate_accessorial" && !hasSupportingDoc) {
    return {
      addCharge: false,
      reason:
        "Looks like a legitimate accessorial charge, but no supporting document is on file — request one from the driver before adding it.",
    };
  }
  if (classification === "likely_error") {
    return { addCharge: false, reason: "Likely a billing error — does not match the rate confirmation." };
  }
  return { addCharge: false, reason: "Uncertain cause for the discrepancy — needs manual review." };
}
