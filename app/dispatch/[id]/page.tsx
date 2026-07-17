import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getScoredCandidates } from "@/lib/dispatch";
import { RecommendationPanel } from "./RecommendationPanel";

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const load = await prisma.load.findUnique({ where: { id } });
  if (!load) notFound();

  const [scored, latestRecommendation, existingAssignment] = await Promise.all([
    getScoredCandidates(load, prisma),
    prisma.recommendation.findFirst({ where: { loadId: id }, orderBy: { computedAt: "desc" } }),
    prisma.assignment.findFirst({
      where: { loadId: id },
      orderBy: { createdAt: "desc" },
      include: { driver: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {load.origin} → {load.destination}
        </h1>
        <p className="text-sm text-zinc-500">
          {load.equipmentRequired} · Pickup {load.pickupWindow} · ${load.revenue.toFixed(0)}
        </p>
      </div>

      {existingAssignment ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Assigned to {existingAssignment.driver.name}
          {existingAssignment.wasRecommended
            ? " (AI recommendation)"
            : ` — override: ${existingAssignment.overrideReason}`}
        </div>
      ) : scored.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No eligible driver: no driver in the fleet has the required equipment (
          {load.equipmentRequired}) with enough HOS remaining for this load.
        </p>
      ) : (
        <RecommendationPanel
          load={load}
          scored={scored}
          cachedRecommendation={
            latestRecommendation
              ? {
                  recommendedDriverId: latestRecommendation.recommendedDriverId,
                  rationale: latestRecommendation.rationale,
                  tieFlag: latestRecommendation.tieFlag,
                  confidence: latestRecommendation.confidence,
                  degraded: latestRecommendation.degraded,
                }
              : null
          }
        />
      )}
    </div>
  );
}
