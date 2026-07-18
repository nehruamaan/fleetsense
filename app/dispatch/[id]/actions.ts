"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function assignDriver(loadId: string, driverId: string, overrideReason?: string) {
  const recommendation = await prisma.recommendation.findFirst({
    where: { loadId },
    orderBy: { computedAt: "desc" },
  });
  const wasRecommended = recommendation?.recommendedDriverId === driverId;

  if (!wasRecommended && !overrideReason?.trim()) {
    throw new Error(
      "An override reason is required when assigning a driver other than the recommended one."
    );
  }

  await prisma.assignment.create({
    data: {
      loadId,
      driverId,
      wasRecommended,
      overrideReason: wasRecommended ? null : overrideReason,
      status: "PENDING",
    },
  });

  await prisma.load.update({ where: { id: loadId }, data: { status: "ASSIGNED" } });

  revalidatePath(`/dispatch/${loadId}`);
  revalidatePath("/dispatch");
}
