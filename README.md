# FleetSense

**An AI-native operations console for small trucking fleets.** FleetSense is a live, interactive prototype built for a single dispatcher ("Dana") to run a small fleet — assigning drivers, reconciling billing documents, and catching problems on the road — with a real LLM (Google Gemini) doing the judgment calls a dispatcher would otherwise make by hand, and code-level guardrails making sure the model never gets the final say on anything that touches money or safety.

Every AI feature in this app makes a real call to Gemini 2.5 Flash at runtime — nothing is mocked or pre-canned. Where a call fails, times out, or comes back malformed, the app falls back to a deterministic, non-AI result rather than breaking.

---

## What it does

FleetSense has three AI-assisted features, all reachable from the same nav bar:

### 🚚 Smart Dispatch (`/dispatch`)
Scores every eligible driver for a load on hours-of-service legality, deadhead miles, and fuel cost, then asks Gemini to pick the best match — including reasoning about soft context a pure cost sort would miss (e.g. a driver's note that they'd rather avoid a specific metro area). The recommendation is independently re-validated against the actual candidate list before it's ever shown or actionable, so the model can't recommend a driver who was never in the running.

### 📄 Billing & Document Automation (`/documents`, `/driver`)
A driver-facing upload flow (`/driver`) submits photos of rate confirmations, PODs, and accessorial docs; Gemini's vision model extracts structured fields from each. When a rate confirmation and POD amount disagree, a second LLM call classifies the discrepancy — but a charge is only ever proposed as addable if the classification says it's legitimate **and** a matching supporting document actually exists on file. That check is enforced in code, not left to the model's word — the core "hallucination guard" of the app.

### 🔔 Proactive Alerts (`/alerts`)
Deterministic detectors (ETA slip, route deviation, dwell, contact loss) run over simulated GPS traces and flag anomalies; Gemini drafts a plain-English read of the situation and a suggested check-in message. A dwell long enough to plausibly be a breakdown is hard-forced to `HIGH` priority in code, regardless of what the model itself guessed — so a model that under-reacts to a dangerous situation can't suppress the alert.

Every AI-generated piece of text in the UI is marked with a small ✦ badge so it's always clear what came from the model versus deterministic logic.

A full click-through guide to every screen and button is in [`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind CSS v4, [lucide-react](https://lucide.dev) |
| Database | SQLite/[Turso](https://turso.tech) via [Prisma 7](https://www.prisma.io) with the `libsql` driver adapter — local file for dev, remote libSQL in production |
| LLM | [Google Gemini 2.5 Flash](https://ai.google.dev) via `@google/generative-ai`, with a shared retry/validate/fallback wrapper (`lib/llm.ts`) |
| Validation | [Zod](https://zod.dev) — every LLM response is schema-validated before it's trusted |
| Testing | [Vitest](https://vitest.dev) — unit tests for the pure/deterministic logic (scoring, reconciliation, exception detection) |
| Icons | lucide-react |

---

## Getting started locally

### 1. Clone and install

```bash
git clone https://github.com/nehruamaan/fleetsense.git
cd fleetsense
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Defaults to `file:./dev.db` — a local SQLite file, already correct for local dev. |
| `DATABASE_AUTH_TOKEN` | Only needed in production against a remote Turso database — see [Deploying](#deploying) below. Leave unset locally. |
| `GEMINI_API_KEY` | A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Required for the AI features to run live; without it, every AI call falls back to its deterministic path. |

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

This creates a local `dev.db`, applies the schema, and seeds it with a fixed set of drivers, loads, documents, and simulated GPS traces covering every demo scenario (a flagship "soft context beats raw cost" dispatch case, a supported vs. unsupported billing discrepancy, a forced-priority breakdown alert, and more).

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/dispatch`.

You can reset the database back to the seeded scenarios at any time, either by re-running `npx prisma db seed`, or by clicking **"Reset demo data"** in the app's nav bar.

### Running tests

```bash
npm test
```

---

## Project structure

```
app/
  dispatch/        Smart Dispatch UI (load list, detail/recommendation page)
  documents/        Billing & document review UI
  driver/            Driver-facing document upload
  alerts/            Proactive Alerts feed
  api/loads/[id]/recommend/   Dispatch recommendation endpoint
lib/
  llm.ts             Shared LLM call wrapper: validate, retry-once, fallback
  dispatch.ts, dispatch-llm.ts        Smart Dispatch scoring + AI ranking
  reconciliation.ts, documents-llm.ts  Billing reconciliation + AI extraction/classification
  exceptions.ts, exceptions-llm.ts     Exception detection + AI read
  geo.ts             Distance/route-deviation math shared across features
prisma/
  schema.prisma      8-model data schema (Driver, Load, Recommendation, Assignment, Document, Invoice, PositionUpdate, Exception)
  seed-data.ts        Seed data + logic (reused by both the CLI seed script and the in-app "Reset demo data" button)
components/
  StatusBadge.tsx, AiBadge.tsx, toast/   Shared UI primitives
docs/
  DEMO_WALKTHROUGH.md   Screen-by-screen guide to using the live app
```

---

## Deploying to Vercel

The database layer uses [Prisma's `libsql` driver adapter](https://www.prisma.io/docs/orm/overview/databases/turso), which works two ways with the exact same code: a local SQLite file for development (no external account needed), or a remote [Turso](https://turso.tech) database in production — Vercel's serverless functions run on an ephemeral filesystem, so a local file-based database wouldn't persist writes there, but a remote libSQL database does.

### 1. Create a Turso database

```bash
# https://docs.turso.tech/cli/installation
turso auth login
turso db create fleetsense
turso db show fleetsense --url          # -> DATABASE_URL
turso db tokens create fleetsense       # -> DATABASE_AUTH_TOKEN
```

(Turso has a free tier that's more than enough for this app.)

### 2. Apply the schema

Prisma's own migration commands only know how to talk to a local SQLite file, not a remote `libsql://` URL, so schema setup on Turso is done by replaying the already-generated migration files directly:

```bash
DATABASE_URL="libsql://<your-db>.turso.io" \
DATABASE_AUTH_TOKEN="<your-token>" \
  npx tsx scripts/apply-turso-migrations.ts
```

### 3. Seed it (optional, for a populated demo)

```bash
DATABASE_URL="libsql://<your-db>.turso.io" \
DATABASE_AUTH_TOKEN="<your-token>" \
  npx prisma db seed
```

### 4. Deploy

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com/new).
2. In the Vercel project's environment variables, set:
   - `DATABASE_URL` — the `libsql://...` URL from step 1
   - `DATABASE_AUTH_TOKEN` — the token from step 1
   - `GEMINI_API_KEY` — your Gemini API key
3. Deploy. `npm install` already runs `prisma generate` via a `postinstall` script (needed since the generated client is git-ignored), so no extra build configuration is required.

From here, every feature — assigning drivers, uploading documents, approving invoices, resetting demo data — writes through to the real, persistent Turso database, the same as it does locally.
