"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AiBadge } from "@/components/AiBadge";
import { assignDriver } from "./actions";
import type { Load } from "@/app/generated/prisma/client";
import type { ScoredDriver } from "@/lib/dispatch";

type CachedRecommendation = {
  recommendedDriverId: string;
  rationale: string;
  tieFlag: boolean;
  confidence: string;
  degraded: boolean;
};

export function RecommendationPanel({
  load,
  scored,
  cachedRecommendation,
}: {
  load: Load;
  scored: ScoredDriver[];
  cachedRecommendation: CachedRecommendation | null;
}) {
  const [status, setStatus] = useState<"idle" | "computing" | "ready" | "fallback">(
    cachedRecommendation ? "ready" : "idle"
  );
  const [live, setLive] = useState<CachedRecommendation | null>(cachedRecommendation);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function compute() {
    setStatus("computing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`/api/loads/${load.id}/recommend`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.status === "ok") {
        setLive({
          recommendedDriverId: data.recommendation.recommendedDriverId,
          rationale: data.recommendation.rationale,
          tieFlag: data.recommendation.tieFlag,
          confidence: data.recommendation.confidence,
          degraded: data.recommendation.degraded,
        });
        setStatus("ready");
      } else {
        setStatus("fallback");
      }
    } catch {
      clearTimeout(timeout);
      setStatus("fallback");
    }
  }

  useEffect(() => {
    if (!cachedRecommendation) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommendedId = live?.recommendedDriverId ?? scored[0]?.driverId;
  const ordered = [...scored].sort((a, b) =>
    a.driverId === recommendedId ? -1 : b.driverId === recommendedId ? 1 : 0
  );

  function handleAssign(driverId: string) {
    const isRecommended = driverId === recommendedId;
    if (!isRecommended && overrideTarget !== driverId) {
      setOverrideTarget(driverId);
      return;
    }
    startTransition(async () => {
      await assignDriver(load.id, driverId, isRecommended ? undefined : overrideReason);
      setOverrideTarget(null);
      setOverrideReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Candidates</h2>
        <button
          onClick={compute}
          disabled={status === "computing"}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Recompute
        </button>
      </div>

      {status === "computing" && <p className="text-sm text-zinc-500">Computing recommendation…</p>}
      {status === "fallback" && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          AI recommendation unavailable right now — showing the deterministic ranking without rationale.
        </p>
      )}

      <div className="grid gap-3">
        {ordered.map((candidate) => {
          const isRecommended =
            candidate.driverId === recommendedId && status !== "fallback" && live !== null;
          return (
            <div
              key={candidate.driverId}
              className={`rounded-lg border p-4 ${
                isRecommended
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {candidate.driver.name} {isRecommended && "· Recommended"}
                </p>
                <p className="text-sm text-zinc-500">
                  Deadhead {Math.round(candidate.deadheadMiles)}mi · ${candidate.fuelCost.toFixed(2)} fuel
                  {candidate.tomorrowConflict && " · Tomorrow conflict"}
                </p>
              </div>
              {candidate.driver.notes && (
                <p className="mt-1 text-xs text-zinc-500">Notes: {candidate.driver.notes}</p>
              )}
              {isRecommended && live && live.rationale && (
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <AiBadge />
                  <span>
                    {live.rationale} {live.tieFlag && "(tie)"} — confidence: {live.confidence}
                    {live.degraded && " (degraded: deterministic fallback used)"}
                  </span>
                </p>
              )}

              {overrideTarget === candidate.driverId ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="One-line reason for overriding the recommendation"
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    disabled={!overrideReason.trim() || isPending}
                    onClick={() => handleAssign(candidate.driverId)}
                    className="rounded-md bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Confirm assign
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleAssign(candidate.driverId)}
                  disabled={isPending}
                  className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Assign
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
