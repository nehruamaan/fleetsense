# FleetSense

**An AI-native operations console for small trucking fleets.**

FleetSense is a live, interactive prototype built for a single dispatcher ("Dana") to run a small fleet — assigning drivers, reconciling billing documents, and catching problems on the road — with a real LLM (Google Gemini 2.5 Flash) doing the judgment calls a dispatcher would otherwise make by hand, and code-level guardrails ensuring the model never gets the final say on anything that touches money or safety.

Every AI feature makes a real network call to Gemini at runtime — nothing is mocked or pre-canned. Where a call fails, times out, or returns malformed output, the app falls back to a deterministic, non-AI result rather than breaking or hallucinating.

> **Live demo →** *(link here once deployed)*
>
> **Demo walkthrough →** [`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md)

---

## What it does

FleetSense has three AI-assisted features, all reachable from the same nav bar:

### 🚚 Smart Dispatch (`/dispatch`)
Scores every eligible driver for a load on hours-of-service legality, deadhead miles, and fuel cost, then asks Gemini to pick the best match — including reasoning about soft context a pure cost-sort would miss (e.g. a driver's note that they'd rather avoid a specific metro area). The recommendation is independently re-validated against the actual candidate list before it's ever shown or actionable, so the model can't recommend a driver who was never eligible.

### 📄 Billing & Document Automation (`/documents`, `/driver`)
A driver-facing upload flow (`/driver`) submits photos of rate confirmations, PODs, and accessorial docs; Gemini's vision model extracts structured fields from each. When a rate-con and POD amount disagree, a second LLM call classifies the discrepancy — but a charge is only ever proposed as addable if the classification says it's legitimate **and** a matching supporting document actually exists on file. That check is enforced in code (`lib/reconciliation.ts`), not left to the model's word — the core **hallucination guard** of the app.

### 🔔 Proactive Alerts (`/alerts`)
Deterministic detectors (ETA slip, route deviation, dwell, contact loss) run over simulated GPS traces and flag anomalies; Gemini drafts a plain-English read of the situation and a suggested check-in message. A dwell long enough to plausibly be a breakdown is hard-forced to `HIGH` priority in code regardless of what the model guessed — so a model that under-reacts to a dangerous situation can't suppress the alert.

Every AI-generated piece of text in the UI is marked with a small **✦ AI** badge so it's always clear what came from the model versus deterministic logic.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind CSS v4, [lucide-react](https://lucide.dev) |
| Database | SQLite / [Turso](https://turso.tech) via [Prisma 7](https://www.prisma.io) with the `@prisma/adapter-libsql` driver — local file for dev, remote libSQL in production |
| LLM | [Google Gemini 2.5 Flash](https://ai.google.dev) via `@google/generative-ai`, with a shared retry / validate / fallback wrapper (`lib/llm.ts`) |
| Validation | [Zod](https://zod.dev) — every LLM response is schema-validated before it's trusted |
| Testing | [Vitest](https://vitest.dev) — unit tests for the pure / deterministic logic (scoring, reconciliation, exception detection) |

---

## Getting started locally

### 1. Clone and install

```bash
git clone https://github.com/nehruamaan/fleetsense.git
cd fleetsense
npm install
```

`npm install` automatically runs `prisma generate` via the `postinstall` script.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Defaults to `file:./dev.db` — a local SQLite file. No changes needed for local dev. |
| `DATABASE_AUTH_TOKEN` | Leave unset locally. Only needed for a remote Turso database (production). |
| `GEMINI_API_KEY` | A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Without it, every AI call falls back to its deterministic path. |

### 3. Set up the local database

```bash
npx prisma migrate deploy
npx prisma db seed
```

This applies the schema to a local `dev.db` file and seeds it with a fixed set of drivers, loads, documents, and simulated GPS traces that cover every demo scenario:
- A **"soft context beats raw cost"** dispatch case
- A **supported** vs **unsupported** billing discrepancy (hallucination guard)
- A **forced-HIGH-priority** breakdown alert

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/dispatch`.

You can reset the database to the seeded scenarios at any time by clicking **"Reset demo data"** in the nav bar, or running `npx prisma db seed`.

### Running tests

```bash
npm test
```

---

## Project structure

```
app/
  dispatch/          Smart Dispatch UI (load list, detail/recommendation page)
  documents/         Billing & document review UI
  driver/            Driver-facing document upload
  alerts/            Proactive Alerts feed
  api/loads/[id]/recommend/   Dispatch recommendation API endpoint
lib/
  llm.ts             Shared LLM wrapper: validate, retry-once, fallback
  dispatch.ts        Driver scoring (deterministic)
  dispatch-llm.ts    AI ranking & rationale
  reconciliation.ts  Billing reconciliation + hallucination guard
  documents-llm.ts   AI field extraction & discrepancy classification
  exceptions.ts      Deterministic exception detectors
  exceptions-llm.ts  AI read & draft message generation
  geo.ts             Distance / route-deviation math
prisma/
  schema.prisma      8-model schema (Driver, Load, Recommendation, Assignment,
                     Document, Invoice, PositionUpdate, Exception)
  seed-data.ts       Seed data — shared by the CLI seed script and the
                     in-app "Reset demo data" button
scripts/
  apply-turso-migrations.ts   One-time schema setup for a fresh Turso DB
                              (Prisma's CLI can't target libsql:// URLs directly)
components/
  StatusBadge.tsx, AiBadge.tsx, toast/   Shared UI primitives
docs/
  DEMO_WALKTHROUGH.md   Screen-by-screen guide to using the live app
```

---

## Deploying to Vercel

The database layer uses the same code path for both environments — only the env vars change:

| Environment | `DATABASE_URL` | `DATABASE_AUTH_TOKEN` |
|---|---|---|
| Local dev | `file:./dev.db` | (unset) |
| Production (Vercel) | `libsql://…turso.io` | your Turso token |

Vercel's serverless functions run on an ephemeral filesystem, so a local SQLite file wouldn't persist writes there. [Turso](https://turso.tech) provides a remote libSQL database that works with the exact same Prisma adapter — no code changes required.

### 1. Create a Turso database

Install the [Turso CLI](https://docs.turso.tech/cli/installation), then:

```bash
turso auth login
turso db create fleetsense
turso db show fleetsense --url      # → DATABASE_URL
turso db tokens create fleetsense   # → DATABASE_AUTH_TOKEN
```

Turso's free tier is more than enough for this app.

### 2. Apply the schema

Prisma's own migration commands can't target a remote `libsql://` URL directly, so schema setup is done by replaying the generated migration SQL files via the libsql client:

```bash
DATABASE_URL="libsql://<your-db>.turso.io" \
DATABASE_AUTH_TOKEN="<your-token>" \
  npx tsx scripts/apply-turso-migrations.ts
```

### 3. Seed with demo data (recommended)

```bash
DATABASE_URL="libsql://<your-db>.turso.io" \
DATABASE_AUTH_TOKEN="<your-token>" \
  npx prisma db seed
```

### 4. Deploy

1. Import the repo into [Vercel](https://vercel.com/new).
2. Set these environment variables in your Vercel project:
   - `DATABASE_URL` — the `libsql://…` URL from step 1
   - `DATABASE_AUTH_TOKEN` — the token from step 1
   - `GEMINI_API_KEY` — your Gemini API key
3. Deploy. No extra build configuration needed — `npm install` runs `prisma generate` automatically via the `postinstall` script.

After deployment, every feature (assigning drivers, uploading documents, approving invoices, resetting demo data) writes through to the persistent Turso database.

---

## Design decisions & guardrails

A few explicit choices worth noting for anyone reading the code:

- **Model can never approve a charge without a paper trail.** The reconciliation path in `lib/reconciliation.ts` checks for a real `ACCESSORIAL` document before ever surfacing an "Add charge" button — even if the LLM classification text sounds confident.
- **Model can never suppress a breakdown alert.** `lib/exceptions.ts` hard-forces any dwell ≥ threshold to `HIGH` priority in code, after the LLM has already returned its guess.
- **Model can never recommend an ineligible driver.** `lib/dispatch-llm.ts` re-validates the recommended driver ID against the actual scored-and-filtered candidate list before acting on it.
- **All LLM responses are Zod-validated.** The shared wrapper in `lib/llm.ts` schema-validates every response and retries once on parse failure before falling back to the deterministic path.
- **Every AI text element is labeled.** The `✦ AI` badge in the UI is attached to every piece of model-generated text, so it's always clear what's AI vs. code.
