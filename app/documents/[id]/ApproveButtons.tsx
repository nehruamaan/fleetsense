"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveInvoice, approveAndQueueEmail } from "./actions";

export function ApproveButtons({
  loadId,
  canAddCharge,
  delta,
  invoiceStatus,
}: {
  loadId: string;
  canAddCharge: boolean;
  delta: number;
  invoiceStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (invoiceStatus === "SENT") {
    return (
      <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
        Invoice approved, email drafted &amp; queued (demo — nothing is actually sent).
      </p>
    );
  }

  if (invoiceStatus === "APPROVED") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Invoice approved.</p>
        <button
          onClick={() =>
            startTransition(async () => {
              await approveAndQueueEmail(loadId);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Approve &amp; Queue Email
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {delta !== 0 && !canAddCharge && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Charge not added — request a supporting document from the driver.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() =>
            startTransition(async () => {
              await approveInvoice(loadId);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Approve Invoice
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await approveAndQueueEmail(loadId);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Approve &amp; Queue Email
        </button>
      </div>
    </div>
  );
}
