# FleetSense — Demo Walkthrough

This is a guided tour of the live app at **https://fleetsense-live.vercel.app**. It covers what each screen does, what to click, and why certain things behave the way they do.

The app puts you in the role of **Dana**, a dispatcher managing a small trucking fleet. The four nav links represent her entire shift, in order:

| Screen | Route | Dana is doing… |
|---|---|---|
| **Dispatch** | `/dispatch` | Assigning a driver to a new load |
| **Driver** | `/driver` | Stand-in for a driver uploading paperwork from their cab |
| **Documents** | `/documents` | Reviewing submitted docs, reconciling billing, approving invoices |
| **Alerts** | `/alerts` | Watching for problems on loads already in transit |

> **Suggested order for a first run:** Dispatch → Driver → Documents → Alerts
>
> Each section below explains what to do and what to watch for.

Everywhere you see a **✦ AI** badge, the text next to it came from a real live Gemini call — not pre-written copy.

---

## 1. Smart Dispatch (`/dispatch`)

**Context:** A load has come in. Dana needs to pick the right driver.

### What you're looking at
A list of loads waiting to be assigned. Click any row to open its detail page.

### What happens when you open a load
The page immediately kicks off a scoring and ranking request:
1. Every eligible driver is scored on HOS legality, deadhead miles, fuel cost, and equipment match — deterministically, in code.
2. Gemini is then asked to rank the top candidates, with access to soft context like driver notes and recent lane history.
3. The recommended driver appears highlighted in green with a **· Recommended** label, an AI rationale, a confidence level, and a tie flag if two drivers were very close.

**You'll often see "Computing recommendation…" for a few seconds.** This is normal — there's a real LLM call in progress. If it takes longer than 3 seconds, the UI falls back to showing the deterministic ranking without rationale (so Dana can keep working), and the AI result loads from cache on your next refresh. This is intentional: *the AI improves decisions but is never required to make them.*

### What to try
- **Assign the recommended driver** → single click, confirmed immediately.
- **Assign a different driver** → an override reason box appears and the Confirm button stays disabled until you type something. This is the audit trail — Dana has to record *why* she disagreed with the AI.
- **Recompute** (top of the panel) → forces a fresh live call so you can watch the loading state again.

### The most interesting load to open
Look for a load where the cheapest driver has a note indicating they avoid a particular area (e.g. "avoids NYC-metro drop-offs"). The AI should demote that driver and explain why in its rationale — this is the **"soft context beats raw cost"** scenario, and the rationale text should make the reasoning explicit.

---

## 2. Driver Upload (`/driver`)

**Context:** A driver has just delivered a load and needs to submit their paperwork.

### What you're looking at
A simple upload form — this is the only screen representing the *driver's* perspective, not Dana's. In a real product this would be a mobile camera interface; here it's a plain form in the browser.

### What to do
1. Pick a **Load** from the dropdown.
2. Pick a **Document type**: BOL, POD, RATE_CON, ACCESSORIAL, or FUEL.
3. Upload an **image** (any image file works — a photo of an actual invoice gives the most interesting extraction result; a random image will still run through the pipeline and return null/low-confidence fields, which is itself useful to see).
4. Click **Submit**.

### What happens behind the scenes
Gemini's vision model reads the image and tries to extract structured fields: load number, amounts, dates, signatures. If the document is legible, you'll see real values. If it isn't, the fields come back honestly as "unknown" or null — the system never fabricates values to fill a field.

After submitting, head to **Documents** to see the result.

---

## 3. Documents (`/documents`)

**Context:** Dana is reviewing submitted paperwork and approving invoices.

### What you're looking at
Every document submitted by any driver, newest first, with a status badge: RECEIVED → EXTRACTED → FAILED.

### Click into any document
You'll see the original image alongside the extracted fields. If the document came back with low confidence on any field, each field shows its confidence level individually.

### The billing reconciliation
When **both** a RATE_CON and a POD exist for the same load, the page automatically reconciles them. If the amounts don't match, Gemini classifies the gap:
- **Legitimate accessorial charge** → the system proposes adding the charge
- **Likely billing error** → flagged for review
- **Uncertain** → Dana decides

**But here's the key guardrail:** even if the AI classification says "legitimate charge" with full confidence, the *Add charge* option only becomes available if an actual ACCESSORIAL document is also on file. No supporting document = no charge, regardless of what the model says. The AI provides reasoning; a code-level rule makes the decision.

This is the **hallucination guard** — you'll see it in action if you open a document where there's a discrepancy but no supporting accessorial doc. The page will say *"Charge not added — request a supporting document from the driver"* instead of surfacing the button.

### Loads worth comparing
| What to look for | What you'll see |
|---|---|
| RATE_CON + POD with matching amounts | Clean reconciliation, no discrepancy |
| RATE_CON + POD with a gap + ACCESSORIAL doc on file | Charge proposed, Add/Approve buttons active |
| RATE_CON + POD with a gap + no ACCESSORIAL doc | Guard fires — charge blocked despite potential AI confidence |
| Garbled or illegible document image | Extracted fields show "unknown", not invented values |

### Buttons on this page
- **Approve Invoice** — marks the invoice approved.
- **Approve & Queue Email** — additionally drafts a confirmation/dispute email from structured fields (not free-form LLM text) and queues it. Nothing is actually sent anywhere — the button and confirmation both say so. The "queue, don't auto-send" design is intentional: Dana always has final approval before anything goes out.

---

## 4. Proactive Alerts (`/alerts`)

**Context:** Loads are already on the road. Dana needs to know if anything is going wrong.

### What you're looking at
An exception feed, sorted HIGH → MED → LOW priority. On a fresh start (or after clicking **Reset demo data**), this page shows **"All loads on track"** — because the monitoring hasn't run yet.

### The "Advance simulation time" button

This button is the most important thing on this page, and it needs a bit of explanation.

In a real deployment, background monitoring would run on a schedule every few minutes — checking GPS position, ETA, dwell time, and last contact for every active load. In this prototype, that job is manual: **clicking "Advance simulation time" runs one cycle of the monitoring job right now**, against simulated GPS data that's baked into the seed.

**What happens when you click it:**
1. Every in-transit load's simulated position trace is evaluated against four deterministic detectors — route deviation, ETA slip, excessive dwell time (truck stopped too long), and contact loss.
2. For each newly-detected problem, Gemini is called to write a plain-English explanation of the situation and draft a suggested check-in message for the driver.
3. The feed refreshes with the resulting exception cards.

**Why it takes 20–30 seconds:** This is not a spinner bug. The app makes several sequential real LLM calls — one per newly detected exception — with no mocking or caching at this stage. The delay is the actual Gemini API latency multiplied by the number of exceptions found. This is deliberate: the latency is real, and hiding it behind a fake fast response would misrepresent the system.

**What to expect after clicking once on a fresh seed:**
- A **route deviation / ETA slip** exception surfaces on one load — HIGH priority, with an AI explanation of what the deviation looks like and a draft check-in message.
- A **prolonged dwell** exception surfaces on another load — the truck has been stopped far longer than a normal rest stop. Because the dwell time crosses the "possible breakdown" threshold, its priority is **hard-forced to HIGH** in code, regardless of what Gemini guessed. The AI cannot downplay a potential breakdown.
- A **third load** produces no exception at all — the detectors don't flag it because nothing is wrong. This proves the system isn't just surfacing everything.

Clicking "Advance simulation time" again moves the clock forward further, potentially surfacing new exceptions on loads that continue to drift.

### Per-exception buttons
- **Approve** — accepts the drafted message and closes the exception.
- **Edit** — opens the draft as editable text so Dana can adjust the wording before approving. Useful if the AI's tone isn't right.
- **Dismiss** — closes the exception without sending anything. Dismissed exceptions are permanently closed; re-running the monitor won't surface the same one again.

Nothing is sent anywhere — "Approve" means "accepted and queued," not "transmitted."

---

## If something looks like a bug but isn't

| What you see | Is it a bug? | Why |
|---|---|---|
| Dispatch page shows "AI recommendation unavailable" | **No** | The 3-second client timeout beat the Gemini response. Reload — the result is cached server-side. |
| "Advance simulation time" appears to hang for 20–30s | **No** | Real sequential LLM calls, not a frozen UI. Wait it out. |
| A document's fields all show "unknown" | **No** | The source image was illegible — this is the honest low-confidence path, not a failure. |
| A billing discrepancy exists but no charge is proposed | **No** | The hallucination guard: no ACCESSORIAL doc on file means no charge, regardless of AI confidence. |
| The Assign button on a non-recommended driver won't submit | **No** | It's waiting for you to type an override reason in the text box above it. |
| Page returns a 500 / crashes | **Yes** | That's a real bug — note what you clicked and what load/document you were on. |

---

## Resetting to a clean state

Click **"Reset demo data"** in the top-right of the nav bar and confirm the dialog. This wipes and reseeds every load, driver, document, exception, and GPS trace back to the original scenarios — so you can walk through the whole thing again from scratch.

All the scenarios described above will be restored. No terminal access needed.
