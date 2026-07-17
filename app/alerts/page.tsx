import { prisma } from "@/lib/prisma";
import { AiBadge } from "@/components/AiBadge";
import { AdvanceSimulationButton } from "./AdvanceSimulationButton";
import { ExceptionActions } from "./ExceptionActions";

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
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          All loads on track.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((exception) => (
            <div
              key={exception.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {exception.type.replace("_", " ")} — {exception.load.origin} → {exception.load.destination}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    exception.priority === "HIGH"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : exception.priority === "MED"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {exception.priority}
                </span>
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
