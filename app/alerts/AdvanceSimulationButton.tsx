"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceSimulation } from "./actions";

export function AdvanceSimulationButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await advanceSimulation();
          router.refresh();
        })
      }
      disabled={isPending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
    >
      {isPending ? "Checking…" : "Advance simulation time"}
    </button>
  );
}
