"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { seedDatabase } from "@/prisma/seed-data";

export async function resetDemoData(): Promise<{ ok: boolean; error?: string }> {
  try {
    await seedDatabase(prisma);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Reset failed." };
  }
}
