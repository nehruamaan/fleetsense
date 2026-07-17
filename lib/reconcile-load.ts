import { prisma } from "./prisma";
import { reconcile } from "./reconciliation";
import { classifyDiscrepancy } from "./documents-llm";

export async function maybeReconcile(loadId: string): Promise<void> {
  const existingInvoice = await prisma.invoice.findUnique({ where: { loadId } });
  if (existingInvoice) return;

  const [rateConDoc, podDoc] = await Promise.all([
    prisma.document.findFirst({ where: { loadId, type: "RATE_CON", status: "EXTRACTED" } }),
    prisma.document.findFirst({ where: { loadId, type: "POD", status: "EXTRACTED" } }),
  ]);
  if (!rateConDoc || !podDoc) return;

  const rateConFields = JSON.parse(rateConDoc.extractedFields ?? "{}");
  const podFields = JSON.parse(podDoc.extractedFields ?? "{}");
  const rateConAmount = typeof rateConFields.amount === "number" ? rateConFields.amount : null;
  const invoiceAmount = typeof podFields.amount === "number" ? podFields.amount : null;
  if (rateConAmount === null || invoiceAmount === null) return;

  const { delta } = reconcile(rateConAmount, invoiceAmount);

  let classification: string | null = null;
  let justification: string | null = null;

  if (delta !== 0) {
    const accessorialDoc = await prisma.document.findFirst({
      where: { loadId, type: "ACCESSORIAL", status: "EXTRACTED" },
    });
    const notes = podFields.accessorialNotes || rateConFields.accessorialNotes || "";
    const result = await classifyDiscrepancy(rateConAmount, invoiceAmount, delta, notes, Boolean(accessorialDoc));
    classification = result?.classification ?? "uncertain";
    justification = result?.justification ?? "";
  }

  await prisma.invoice.create({
    data: {
      loadId,
      amount: invoiceAmount,
      status: "DRAFT",
      reconciliation: JSON.stringify({ rateConAmount, delta, classification, justification }),
    },
  });
}
