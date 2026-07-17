// app/documents/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveChargeDecision, type DiscrepancyClassification } from "@/lib/reconciliation";

export async function approveInvoice(loadId: string) {
  await prisma.invoice.update({ where: { loadId }, data: { status: "APPROVED" } });
  revalidatePath("/documents");
}

export async function approveAndQueueEmail(loadId: string) {
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  const invoice = await prisma.invoice.findUnique({ where: { loadId } });
  if (!load || !invoice) throw new Error("Load or invoice not found.");

  const reconciliation: { delta?: number; classification?: string | null } | null = invoice.reconciliation
    ? JSON.parse(invoice.reconciliation)
    : null;

  let canAddCharge = false;
  if (
    reconciliation &&
    typeof reconciliation.delta === "number" &&
    reconciliation.delta !== 0 &&
    reconciliation.classification
  ) {
    const accessorialDoc = await prisma.document.findFirst({
      where: { loadId, type: "ACCESSORIAL", status: "EXTRACTED" },
    });
    canAddCharge = resolveChargeDecision(
      reconciliation.classification as DiscrepancyClassification,
      Boolean(accessorialDoc)
    ).addCharge;
  }

  const emailText = buildEmailDraft(load.id, reconciliation, canAddCharge);

  await prisma.invoice.update({
    where: { loadId },
    data: {
      status: "SENT",
      reconciliation: JSON.stringify({ ...(reconciliation ?? {}), emailDraft: emailText }),
    },
  });

  revalidatePath("/documents");
}

function buildEmailDraft(
  loadId: string,
  reconciliation: { delta?: number; classification?: string | null } | null,
  canAddCharge: boolean
): string {
  const shortId = loadId.slice(-6);
  if (canAddCharge && reconciliation && typeof reconciliation.delta === "number") {
    return `Accessorial charge of $${Math.abs(reconciliation.delta).toFixed(
      2
    )} noted per documentation for Load #${shortId}, confirming for invoice.`;
  }
  return `Invoice for Load #${shortId} confirmed, no additional charges noted.`;
}
