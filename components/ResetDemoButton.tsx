"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDemoData } from "@/app/reset-demo-action";

export function ResetDemoButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const router = useRouter();

  function handleClick() {
    const confirmed = window.confirm(
      "This wipes all loads, drivers, documents, and alerts and reseeds the demo scenarios. Continue?"
    );
    if (!confirmed) return;

    setResult(null);
    startTransition(async () => {
      const res = await resetDemoData();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {result?.ok && <span className="text-xs text-emerald-700 dark:text-emerald-400">Reset ✓</span>}
      {result && !result.ok && (
        <span className="text-xs text-red-700 dark:text-red-400">{result.error}</span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {isPending ? "Resetting…" : "Reset demo data"}
      </button>
    </div>
  );
}
