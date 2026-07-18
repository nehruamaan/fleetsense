import { CheckCircle2, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AiBadge } from "@/components/AiBadge";
import { AdvanceSimulationButton } from "./AdvanceSimulationButton";
import { ExceptionActions } from "./ExceptionActions";
import { StatusBadge } from "@/components/StatusBadge";

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MED: 1, LOW: 2 };

export default async function AlertsPage() {
  const exceptions = await prisma.exception.findMany({
    where: { status: "OPEN" },
    include: { load: true },
  });
  const sorted = [...exceptions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exceptions</h1>
        <AdvanceSimulationButton />
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
          All loads on track.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((exception) => (
            <div
              key={exception.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  <span className="inline-flex items-center gap-1">
                    {exception.type.replace("_", " ")} — {exception.load.origin}{" "}
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> {exception.load.destination}
                  </span>
                </p>
                <StatusBadge domain="priority" status={exception.priority} />
              </div>
              {exception.aiRead && (
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <AiBadge />
                  <span>{exception.aiRead}</span>
                </p>
              )}
              <ExceptionActions exceptionId={exception.id} draftMessage={exception.draftMessage} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
