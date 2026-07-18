# FleetSense — Local Demo Walkthrough

The dev server runs at **http://localhost:3000**. This doc is a guided tour — what each screen is for, which buttons are "user input" you're meant to press, and what should happen when you press them.

If the server isn't running:

```bash
npm run dev
```

Then open http://localhost:3000 — it redirects to `/dispatch`.

---

## The four screens

| Nav link | Route | Role it stands in for |
|---|---|---|
| Dispatch | `/dispatch` | Dana (the dispatcher) picking a driver for a load |
| Documents | `/documents` | Dana reviewing driver-submitted paperwork and approving invoices |
| Alerts | `/alerts` | Dana's proactive exception feed for in-transit loads |
| Driver | `/driver` | Stand-in for a driver's phone camera, uploading a document |

Every place you see a small **✦ AI** badge, the text next to it came from a real Gemini call made at that moment (or cached from the last one) — not canned copy.

---

## 1. Smart Dispatch (`/dispatch`)

**What you're looking at:** a list of loads that need a driver assigned. Click any row to open its detail page.

**What happens when you open a load detail page (`/dispatch/[id]`):**
- The page immediately fires a request to score every eligible driver and ask Gemini to rank the top 3.
- You'll usually see **"Computing recommendation…"** for a moment. There's a hard 3-second client-side timeout — if the real Gemini call takes longer (common), the panel falls back to **"AI recommendation unavailable right now — showing the deterministic ranking without rationale."** This is expected, per-spec behavior, not a bug: the call is still finishing on the server. Refresh the page a few seconds later and the real recommendation (with rationale) will now be there, served from cache.
- The recommended driver is highlighted green with **"· Recommended"**, along with the AI rationale under the ✦ AI badge, a confidence level, and a tie flag if the top 2 were close.

**Try these interactions:**
- **Recompute** button (top of the Candidates panel) — forces a fresh live call instead of using the cached recommendation. Useful if you want to watch the "Computing…" state again.
- **Assign** button on any candidate:
  - If you assign the **recommended** driver, it's a single click — no extra confirmation needed.
  - If you assign anyone **else**, an input box appears asking for a one-line override reason. The **Confirm assign** button stays disabled until you type something — this is deliberate, it's the audit trail for "why did Dana ignore the AI."
  - Once assigned, the page replaces the whole Candidates panel with a green **"Assigned to {name}"** banner — you can't double-assign the same load.

**Interesting loads to open, to see different behaviors:**
- A load whose only eligible equipment type nobody has → an honest empty state, not a crash.
- A load with no planned route → renders fine without ETA/route info.
- A load into a lane one of the cheaper drivers has a note about avoiding (e.g. a driver who "avoids NYC-metro drop-offs") → the AI should demote that cheaper driver and recommend someone else, with the rationale explicitly citing the note. This is the flagship "soft context beats raw cost" moment — read the rationale text to confirm it's reasoning about the note, not just re-stating the cheapest option.

---

## 2. Driver upload (`/driver`)

**What you're looking at:** a simple form — this is the only screen meant to represent the *driver's* side of the app, not Dana's.

**What to do:**
1. Pick a **Load** from the dropdown.
2. Pick a **Document type** (BOL / POD / RATE_CON / ACCESSORIAL / FUEL).
3. Choose a **Photo** — any image file works (a real photo of a rate confirmation or invoice will produce the most legible extraction; a random image will still run through the pipeline but likely extract null/low-confidence fields, which is itself worth seeing).
4. Click **Submit**.

**What happens:** the file is stored, a `Document` row is created, and a real Gemini vision call attempts to extract fields (amounts, dates, load numbers) from the image. You're redirected/can navigate to Documents In to see the result. If the image is unreadable, the extraction fields come back honestly null rather than fabricated — check this on the Documents detail page (below).

---

## 3. Documents In (`/documents`)

**What you're looking at:** every document any driver has submitted, newest first, with its processing status (RECEIVED / EXTRACTED / FAILED).

Click into any document (`/documents/[id]`) to see:
- The uploaded image next to its extracted fields (with a per-field confidence label where available).
- If **both** a RATE_CON and a POD exist for that load, the page automatically reconciles them and — if the amounts differ — asks Gemini to classify the discrepancy (legitimate accessorial charge / likely error / uncertain).
- The reasoning under the ✦ AI badge explains what it decided and why.

**The key thing to look for — the hallucination guard:** a charge is only ever proposed as addable if the classification says "legitimate accessorial" **and** a matching `ACCESSORIAL` document actually exists on file for that load. If the amounts don't match but there's no supporting accessorial document, you'll see:

> "Charge not added — request a supporting document from the driver."

— even if the LLM's own text sounds confident. This is enforced in code (`lib/reconciliation.ts`'s `resolveChargeDecision`), not just the prompt, specifically so the model can't talk its way into authorizing a charge with no paper trail.

**Buttons on this page:**
- **Approve Invoice** — marks the invoice approved, no charge decisions get revisited.
- **Approve & Queue Email** — additionally drafts a templated confirmation/dispute email (built from structured fields, not freeform LLM text) and marks it queued. Nothing is actually emailed anywhere — the button label and the confirmation text both say so; this is intentional per spec ("nothing auto-sends").

**Loads worth comparing:**
- One with a clean rate-con/POD pair → no discrepancy shown at all.
- One with a supported detention/accessorial delta → charge gets proposed, both buttons work end to end.
- One with an unsupported mismatch → refuses to add the charge (see guard above).
- One with a garbled/unreadable source document → extracted fields render as "unknown," not made-up numbers.

---

## 4. Proactive Alerts (`/alerts`)

**What you're looking at:** a feed of exceptions (things going wrong with in-transit loads), sorted HIGH → MED → LOW priority. On a fresh seed, this starts empty — **"All loads on track."** — because detection hasn't run yet.

**The one button that drives everything here: "Advance simulation time."**

This is a stand-in for "time passing" / a background job that would normally run on a schedule. Clicking it:
1. Re-evaluates every in-transit load's simulated GPS trace against four deterministic detectors (ETA slip, route deviation, dwell/stopped, contact loss).
2. For any newly-detected exception, calls Gemini to draft a plain-English read of the situation and a suggested check-in message.
3. Refreshes the feed with the new exception cards.

This takes a little while (it's making several sequential real Gemini calls) — expect 20-30 seconds, not instant. If you click it and nothing seems to happen immediately, give it a moment and refresh.

**What you should see after clicking it once on a fresh seed:**
- One load with a route deviation / ETA slip exception, HIGH priority, with an AI explanation.
- One load that's been stationary far longer than a normal stop, flagged DWELL. If the stop is long enough to plausibly be a breakdown, priority is **hard-forced to HIGH in code** regardless of what the LLM itself guessed — this override exists specifically so a model that under-reacts to a dangerous situation can't suppress the alert.
- A third, "clean" load produces no exception at all — proving the detectors aren't just flagging everything.

**Per-exception buttons:**
- **Approve** — accepts the drafted message as-is and closes the exception out.
- **Edit** — turns the draft into an editable textarea before you approve it, in case Dana wants to change the wording before it goes out (still nothing is actually sent — same "queue, don't send" rule as Documents).
- **Dismiss** — closes the exception without sending anything. Dismissed exceptions stay dismissed — clicking "Advance simulation time" again won't re-raise the same one.

Clicking "Advance simulation time" again later can surface further/new exceptions on loads that keep drifting, since it re-checks everything against the (simulated) current time each time you press it.

---

## If something looks broken vs. is expected

| What you see | Expected? |
|---|---|
| Dispatch detail page shows "AI recommendation unavailable" on first load | Yes — 3s client timeout beat the real Gemini call. Reload the page. |
| "Advance simulation time" appears to hang for 20-30s | Yes — 3 sequential real LLM calls, no shortcuts taken. |
| A document's extracted fields are all "unknown" | Yes, if the source image was actually illegible — this is the low-confidence path working correctly, not a failure. |
| A discrepancy exists but no charge gets added | Yes, if there's no supporting `ACCESSORIAL` document — this is the hallucination guard, not a missed feature. |
| Clicking Assign on the non-recommended driver won't submit | Yes — it's waiting for you to type an override reason first. |
| Page actually 500s / crashes | Not expected — flag this, it's a real bug. |

---

## Resetting to a clean demo state

Click **"Reset demo data"** in the top-right of the nav header (next to "Dana's Fleet"), then confirm the dialog. This wipes and reseeds all loads/drivers/documents/exceptions back to the scenarios described above, so you can re-run the walkthrough from scratch — no terminal needed.

If you're working from a terminal instead, the equivalent command is:

```bash
npx prisma db seed
```
