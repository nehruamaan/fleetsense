"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceSimulation } from "./actions";
import { useToast } from "@/components/toast/ToastProvider";

export function AdvanceSimulationButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function handleClick() {
    startTransition(async () => {
      try {
        await advanceSimulation();
        showToast("Simulation advanced.");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to advance simulation.", "error");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
    >
      {isPending ? "Checking…" : "Advance simulation time"}
    </button>
  );
}
