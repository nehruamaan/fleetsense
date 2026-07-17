import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { filterEligibleDrivers, scoreDrivers, topCandidates } from "@/lib/dispatch";
import { getDispatchRecommendation } from "@/lib/dispatch-llm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loadId } = await params;

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  const [drivers, activeAssignments] = await Promise.all([
    prisma.driver.findMany(),
    prisma.assignment.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] } },
      select: { driverId: true },
    }),
  ]);
  const busyDriverIds = new Set(activeAssignments.map((a) => a.driverId));

  const eligible = filterEligibleDrivers(load, drivers);
  if (eligible.length === 0) {
    return NextResponse.json({ status: "no_eligible_drivers" as const });
  }

  const scored = scoreDrivers(eligible, busyDriverIds);
  const top3 = topCandidates(scored, 3);
  const result = await getDispatchRecommendation(load, top3);

  const recommendation = await prisma.recommendation.create({
    data: {
      loadId,
      rankedDrivers: JSON.stringify(
        top3.map((c) => ({
          driverId: c.driverId,
          hosOk: true,
          deadheadMiles: c.deadheadMiles,
          fuelCost: c.fuelCost,
          tomorrowConflict: c.tomorrowConflict,
        }))
      ),
      recommendedDriverId: result.recommendedDriverId,
      rationale: result.rationale,
      tieFlag: result.tieFlag,
      confidence: result.confidence,
      degraded: result.degraded,
    },
  });

  return NextResponse.json({ status: "ok" as const, recommendation, top3 });
}
