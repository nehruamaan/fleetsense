// app/alerts/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { detectExceptions } from "@/lib/exceptions";
import { getExceptionRead } from "@/lib/exceptions-llm";

export async function advanceSimulation() {
  const inTransitLoads = await prisma.load.findMany({
    where: { status: "IN_TRANSIT" },
    include: { positionUpdates: true },
  });

  const maxRecorded = await prisma.positionUpdate.aggregate({ _max: { recordedAt: true } });
  const simulatedNow = maxRecorded._max.recordedAt ?? new Date();

  for (const load of inTransitLoads) {
    const candidates = detectExceptions(load, load.positionUpdates, simulatedNow);

    for (const candidate of candidates) {
      // DISMISSED counts as "already handled" too -- a dispatcher dismissing an
      // exception means it stays suppressed, not that it silently reappears
      // (and re-spends a real LLM call) the next time detection runs.
      const existing = await prisma.exception.findFirst({
        where: { loadId: load.id, type: candidate.type, status: { in: ["OPEN", "APPROVED", "DISMISSED"] } },
      });
      if (existing) continue;

      try {
        const { result } = await getExceptionRead(load, candidate);

        await prisma.exception.create({
          data: {
            loadId: load.id,
            type: candidate.type,
            priority: result.priority,
            aiRead: result.likelyCause,
            draftMessage: result.draftDriverMessage ?? result.draftCustomerMessage ?? null,
            status: "OPEN",
          },
        });
      } catch (err) {
        // The load this candidate belongs to may have been deleted mid-loop
        // (e.g. "Reset demo data" clicked while a slow, multi-call simulation
        // advance is still in flight) -- skip it rather than letting one
        // stale candidate crash the rest of the simulation advance.
        console.warn(`Skipping exception for load ${load.id}: it may have been reset mid-simulation.`, err);
      }
    }
  }

  revalidatePath("/alerts");
}

export async function approveException(id: string, editedMessage?: string) {
  await prisma.exception.update({
    where: { id },
    data: {
      status: "APPROVED",
      ...(editedMessage !== undefined ? { draftMessage: editedMessage } : {}),
    },
  });
  revalidatePath("/alerts");
}

export async function dismissException(id: string) {
  await prisma.exception.update({ where: { id }, data: { status: "DISMISSED" } });
  revalidatePath("/alerts");
}
