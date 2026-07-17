import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { maybeReconcile } from "@/lib/reconcile-load";
import { resolveChargeDecision } from "@/lib/reconciliation";
import { AiBadge } from "@/components/AiBadge";
import { ApproveButtons } from "./ApproveButtons";

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id }, include: { load: true } });
  if (!document) notFound();

  await maybeReconcile(document.loadId);

  const invoice = await prisma.invoice.findUnique({ where: { loadId: document.loadId } });
  const extractedFields = document.extractedFields ? JSON.parse(document.extractedFields) : null;
  const confidencePerField = document.confidencePerField ? JSON.parse(document.confidencePerField) : null;

  const reconciliation: { rateConAmount: number; delta: number; classification: string | null; justification: string | null } | null =
    invoice?.reconciliation ? JSON.parse(invoice.reconciliation) : null;

  let decision: { addCharge: boolean; reason: string } | null = null;
  if (reconciliation && reconciliation.delta !== 0 && reconciliation.classification) {
    const accessorialDoc = await prisma.document.findFirst({
      where: { loadId: document.loadId, type: "ACCESSORIAL", status: "EXTRACTED" },
    });
    decision = resolveChargeDecision(
      reconciliation.classification as "legitimate_accessorial" | "likely_error" | "uncertain",
      Boolean(accessorialDoc)
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {document.type} — Load #{document.loadId.slice(-6)}
      </h1>
      <p className="text-sm text-zinc-500">
        {document.load.origin} → {document.load.destination}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={document.imageUrl}
          alt={`${document.type} document`}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
        />

        <div className="space-y-2">
          <h2 className="text-lg font-medium">Extracted fields</h2>
          {document.status === "FAILED" || !extractedFields ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Extraction failed or fields are illegible — no data could be confidently extracted.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(extractedFields)
                .filter(([key]) => key !== "confidence")
                .map(([key, value]) => (
                  <li key={key}>
                    <span className="font-medium">{key}:</span>{" "}
                    {value === null ? <span className="text-zinc-400">unknown</span> : String(value)}
                    {confidencePerField?.[key] && (
                      <span className="ml-1 text-xs text-zinc-400">({confidencePerField[key]} confidence)</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {reconciliation && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Reconciliation</h2>
          <p className="text-sm">
            Rate con: ${reconciliation.rateConAmount.toFixed(2)} · Delta: ${reconciliation.delta.toFixed(2)}
          </p>
          {decision && (
            <p className="mt-2 flex items-start gap-2 text-sm">
              <AiBadge />
              <span>{decision.reason}</span>
            </p>
          )}
          {invoice && (
            <ApproveButtons
              loadId={document.loadId}
              canAddCharge={decision?.addCharge ?? false}
              delta={reconciliation.delta}
              invoiceStatus={invoice.status}
            />
          )}
        </div>
      )}
    </div>
  );
}
