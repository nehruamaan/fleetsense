"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lightbulb, X } from "lucide-react";

type Section = { heading: string; bullets: string[] };

const SECTIONS: Section[] = [
  {
    heading: "Scope",
    bullets: [
      'Went deep on 3 of 5 areas instead of shallow on all 5: Smart Dispatch (assignment recommendation), Proactive Alerts (exception detection + AI read), and Billing & Document Automation (document tracking + invoice reconciliation guard). A reviewer is more convinced by 3 areas that genuinely work end-to-end with real LLM calls than 5 that are each half-mocked.',
      'Cost Intelligence and Safety & Compliance were left out as standalone areas (though pieces leak into the other three, e.g., a cost/deadhead signal informs the dispatch rationale). Those two felt more "analytics dashboard"-shaped than "AI making a judgment call"-shaped, which would have diluted the demo’s core thesis.',
    ],
  },
  {
    heading: "Persona and workflow",
    bullets: [
      "Single persona: the dispatcher. No login/auth, no multi-tenant roles. The brief's pain points are all told from the dispatcher's chair, so the whole click-through experience optimises for that single persona.",
      'Human-in-the-loop, not autonomous action. Every AI output (recommendation, exception read, draft message) is reviewed, edited, and explicitly approved or dismissed by the dispatcher; nothing auto-executes. Dispatch decisions carry real cost/safety consequences, so this reads as a copilot, not a black box, which also directly answers the brief’s "AI in the loop" framing.',
      "Drafted messages aren't actually sent. They're text for the dispatcher to copy into their own SMS/email flow. Real delivery infra was orthogonal to the brief's actual ask.",
    ],
  },
  {
    heading: "Data and simulation",
    bullets: [
      "No real telematics/ELD/TMS integration (no Samsara, Motive, Geotab). All loads, drivers, positions, HOS, and documents are seeded with synthetic data. The brief focuses on the AI decision layer, not a systems-integration project, and synthetic data makes the demo deterministic and repeatable for a one-time reviewer.",
      '"Simulated now" instead of a live clock: the app’s notion of "current time" is derived from MAX(recordedAt) across position updates — a plain SQL aggregate (SELECT MAX(recordedAt) FROM PositionUpdate) that returns the latest timestamp already present in the seeded data, not the real system clock. Clicking "Advance simulation time" writes new PositionUpdate rows with later recordedAt values, so "now" advances in lockstep with the data whenever that button is clicked and remains frozen otherwise. Assumption: a reviewer needs to be able to walk through a scenario at their own pace and get the same result every time, regardless of what day or hour they actually click through it, which a real-time clock ticking in the background would break.',
      '"Reset demo data" exists precisely because a live, publicly-clickable prototype gets its state mutated by every visitor — without it, the first person to click through permanently burns the interesting scenarios for everyone after.',
    ],
  },
  {
    heading: "AI usage",
    bullets: [
      'LLM calls are reserved for judgment/narrative tasks (why an exception likely happened, drafting messages, explaining a recommendation). At the same time, deterministic math stays in code (distance/ETA/deadhead, HOS remaining, detection thresholds). This is both more honest and more defensible against the brief’s explicit "should actually call an LLM, not be mocked" requirement, since it’s clear which parts require real AI reasoning vs. deterministic logic.',
      "LLM output is never unquestioningly trusted: Zod-validated, retried once, and falls back to a deterministic default rather than crashing. A dispatcher's workflow can't go down because of one flaky response.",
      "Billing includes a hallucination guard against the LLM inventing line items; billing is the one area where a fabricated number is a direct dollar error. Hence, it's the one place where a guardrail was treated as non-optional.",
    ],
  },
  {
    heading: "Tech stack and deployment",
    bullets: [
      "Built a real running web app over a slide-deck mockup or no-code prototype: the brief explicitly mentioned something to click through and use, so I focused on real interaction fidelity.",
      'SQLite locally, Turso (libSQL) in production, identical Prisma schema for both: minimising migration risk when moving from local to Vercel mattered more than picking a more "enterprise" DB for a take-home project.',
      'Production readiness was scoped to "correct for a reviewer clicking through," not "hardened for real fleet data at scale": no rate limiting, no real auth, no audit log.',
    ],
  },
];

function AssumptionsModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assumptions-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/25 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/40"
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/40 via-white/5 to-transparent dark:from-white/10" />

        <div className="relative flex items-start justify-between gap-4 border-b border-white/30 px-6 py-4 dark:border-white/10">
          <h2 id="assumptions-title" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Assumptions Behind the FleetSense Build
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-zinc-600 hover:bg-white/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                {section.heading}
              </h3>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {section.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AssumptionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={`transition-all duration-300 ease-out ${
          open ? "pointer-events-none scale-[0.97] blur-[2px] opacity-90" : "scale-100 blur-0 opacity-100"
        }`}
      >
        {children}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/25 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-lg shadow-black/10 backdrop-blur-xl transition hover:bg-white/35 hover:shadow-xl active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
      >
        <Lightbulb className="h-4 w-4" aria-hidden />
        Assumptions
      </button>

      {open && <AssumptionsModal onClose={() => setOpen(false)} />}
    </>
  );
}
