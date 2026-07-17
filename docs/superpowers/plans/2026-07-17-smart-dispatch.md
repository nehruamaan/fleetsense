# Smart Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FleetSense's Smart Dispatch feature (build spec §4) — deterministic HOS/cost filtering finds the top 3 eligible drivers for a load, a real Gemini call ranks them and writes a plain-language rationale (factoring in each driver's free-text notes), and the dispatcher assigns a driver through the UI with an override reason required when they go against the AI's pick.

**Architecture:** Two pure, unit-tested modules (`lib/geo.ts` for distance math, `lib/dispatch.ts` for HOS-eligibility filtering and cost scoring) feed a thin LLM-calling module (`lib/dispatch-llm.ts`) that wraps `lib/llm.ts`'s existing `callLLM()`. A Route Handler (`app/api/loads/[id]/recommend`) orchestrates filter → score → LLM → persist, callable from the client with a 3-second abort timeout so "Computing…" degrades to the deterministic ranking exactly per spec. Two Server Components (`/dispatch`, `/dispatch/[id]`) render the data; one Server Action (`assignDriver`) performs the only real mutation.

**Tech Stack:** Next.js 16 App Router (Server Components, Route Handlers, Server Actions), Prisma 7 via `lib/prisma.ts`, Zod, `lib/llm.ts`'s `callLLM`, Vitest (newly added in Task 1).

## Global Constraints

- Every LLM call goes through `lib/llm.ts`'s `callLLM<T>(options, zodSchema)` — never call the Gemini SDK directly (`lib/llm.ts:1-86`, already built and verified in the foundation phase).
- Every DB access goes through the `prisma` singleton from `lib/prisma.ts` — never instantiate a second `PrismaClient`.
- **Hard rule (spec §4 step 5):** the LLM's `recommendedDriverId` must be validated in code as one of the 3 candidate IDs it was given. A model that names any other ID is treated as a failure and falls back to the deterministic top-1, exactly like a schema-validation failure.
- No LLM output executes an action directly (spec §7) — the LLM call only produces a `Recommendation` row; `assignDriver` (a human clicking Assign) is the only thing that ever creates an `Assignment` or changes `Load.status`.
- AI-generated text in the UI is wrapped in the `AiBadge` component (`components/AiBadge.tsx`, already built in Task Group 0).
- Fold setup/config into the task that needs it; don't add speculative abstractions beyond what this plan specifies.

---

## Task 1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a `"test": "vitest run"` script and `vitest` available to every later task's test files under `tests/lib/`.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add the config file**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the test script**

Edit `package.json`'s `"scripts"` block to add:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify the runner works with a throwaway smoke test**

Create `tests/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`, exit code 0.

- [ ] **Step 5: Delete the smoke test**

```bash
rm tests/lib/smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest"
```

---

## Task 2: Extend seed data for the flagship "soft context flips the pick" demo

**Why:** the existing seeded drivers are spread coast-to-coast, so for most loads only 0-1 drivers of the matching equipment type are geographically close enough to be HOS-eligible — there's no real competition to demote. The spec's most important demo moment (§8 item 1: a driver's notes flip the pick away from the cheapest option) needs **3 genuinely eligible Dry Van drivers** for one load, where the geographically-cheapest one (Alice Rivera, whose notes say she avoids NYC-metro drop-offs) should lose to a costlier-but-unencumbered driver.

**Files:**
- Modify: `prisma/seed.ts:172-173` (append 2 driver definitions after Jamal Brooks, before the closing `];`)
- Modify: `prisma/seed.ts:193` (add the 2 new names to the destructuring line)
- Modify: `prisma/seed.ts:362-363` (append 1 load definition after the INVOICED load, before the closing `];`)

**Interfaces:**
- Produces: two new `Driver` rows ("Priya Shah", "Marcus Webb") and one new `NEW` `Load` row (Trenton, NJ → Newark, NJ) that `lib/dispatch.ts` (Task 4/5) will filter and score, and that manual verification (Task 10) will open in the browser.

- [ ] **Step 1: Add two Dry Van drivers positioned in the Northeast corridor**

In `prisma/seed.ts`, insert after the Jamal Brooks block (after line 172, before the `];` on line 173):

```ts
    {
      name: "Priya Shah",
      currentLat: 39.2904,
      currentLng: -76.6122,
      hosRemainingMinutes: 600,
      hos14hrWindowMinutes: 750,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["MD-PA", "MD-VA"],
    },
    {
      name: "Marcus Webb",
      currentLat: 40.4406,
      currentLng: -79.9959,
      hosRemainingMinutes: 580,
      hos14hrWindowMinutes: 720,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["PA-OH", "PA-NY"],
    },
```

- [ ] **Step 2: Add the two names to the destructuring line**

Change line 193 from:
```ts
  const [alice, ben, carla, derek, elena, frank, grace, hassan, isla, jamal] = drivers;
```
to:
```ts
  const [alice, ben, carla, derek, elena, frank, grace, hassan, isla, jamal, priya, marcus] = drivers;
```

- [ ] **Step 3: Add the flagship load**

Insert after the INVOICED load block (after line 362, before the `];` on line 363):

```ts
    {
      // Flagship "soft context flips the pick" case: Alice is closest/cheapest
      // (she's essentially at the origin already) but her notes say she avoids
      // NYC-metro drop-offs -- this load's destination IS NYC-metro (Newark).
      // Priya and Marcus are real, costlier, unencumbered competitors.
      origin: "Trenton, NJ",
      destination: "Newark, NJ",
      pickupWindow: "2026-07-19 07:00-09:00",
      deliveryWindow: "2026-07-19 11:00-13:00",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-74.76, 40.22], [-74.17, 40.74]] }),
      plannedETA: hours(26),
      revenue: 780,
      status: "NEW" as const,
      customerEmail: "ops@garden-state-retail.example",
    },
```

- [ ] **Step 4: `priya`/`marcus` are unused-variable warnings until Task 9 — silence with an eslint-disable is NOT needed since they're not referenced yet; skip ahead**

(No action — TypeScript won't error on unused destructured variables from an array; only `noUnusedLocals` would, and that's off in `tsconfig.json`. Verify this assumption in Step 5.)

- [ ] **Step 5: Re-run the seed and verify counts**

Run:
```bash
npx prisma db seed
```
Expected: `Seed complete.` with no errors.

```bash
sqlite3 dev.db "select count(*) from Driver;"   # expect 12
sqlite3 dev.db "select count(*) from Load;"     # expect 13
sqlite3 dev.db "select origin, destination from Load where destination = 'Newark, NJ';"
```
Expected: the Trenton→Newark row is present.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed 2 more drivers + flagship dispatch-demo load"
```

---

## Task 3: `lib/geo.ts` — city coordinates and distance math

**Files:**
- Create: `lib/geo.ts`
- Test: `tests/lib/geo.test.ts`

**Interfaces:**
- Produces: `Coordinates = { lat: number; lng: number }`, `lookupCityCoords(cityName: string): Coordinates` (throws if unmapped), `haversineMiles(a: Coordinates, b: Coordinates): number`. Task 4 imports both.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/geo.test.ts
import { describe, it, expect } from "vitest";
import { haversineMiles, lookupCityCoords } from "../../lib/geo";

describe("haversineMiles", () => {
  it("returns 0 for identical coordinates", () => {
    const point = { lat: 40.7128, lng: -74.006 };
    expect(haversineMiles(point, point)).toBeCloseTo(0, 5);
  });

  it("matches the known NYC-to-Philadelphia distance within 5 miles", () => {
    const nyc = lookupCityCoords("New York, NY");
    const philly = lookupCityCoords("Philadelphia, PA");
    const miles = haversineMiles(nyc, philly);
    expect(miles).toBeGreaterThan(75);
    expect(miles).toBeLessThan(85);
  });
});

describe("lookupCityCoords", () => {
  it("throws a clear error for an unmapped city", () => {
    expect(() => lookupCityCoords("Nowhere, XX")).toThrow(/No coordinates known/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: FAIL — `Cannot find module '../../lib/geo'`.

- [ ] **Step 3: Implement `lib/geo.ts`**

```ts
export type Coordinates = { lat: number; lng: number };

const CITY_COORDS: Record<string, Coordinates> = {
  "Newark, NJ": { lat: 40.7357, lng: -74.1724 },
  "Columbus, OH": { lat: 39.9612, lng: -82.9988 },
  "Chicago, IL": { lat: 41.8781, lng: -87.6298 },
  "Memphis, TN": { lat: 35.1495, lng: -90.049 },
  "Atlanta, GA": { lat: 33.749, lng: -84.388 },
  "Jacksonville, FL": { lat: 30.3322, lng: -81.6557 },
  "Denver, CO": { lat: 39.7392, lng: -104.9903 },
  "Salt Lake City, UT": { lat: 40.7608, lng: -111.891 },
  "Portland, OR": { lat: 45.5152, lng: -122.6784 },
  "Boise, ID": { lat: 43.615, lng: -116.2023 },
  "Philadelphia, PA": { lat: 39.9526, lng: -75.1652 },
  "Richmond, VA": { lat: 37.5407, lng: -77.436 },
  "Houston, TX": { lat: 29.7604, lng: -95.3698 },
  "New Orleans, LA": { lat: 29.9511, lng: -90.0715 },
  "New York, NY": { lat: 40.7128, lng: -74.006 },
  "Cleveland, OH": { lat: 41.4993, lng: -81.6944 },
  "Indianapolis, IN": { lat: 39.7684, lng: -86.1581 },
  "Charlotte, NC": { lat: 35.2271, lng: -80.8431 },
  "Seattle, WA": { lat: 47.6062, lng: -122.3321 },
  "Dallas, TX": { lat: 32.7767, lng: -96.797 },
  "Tulsa, OK": { lat: 36.154, lng: -95.9928 },
  "Trenton, NJ": { lat: 40.2206, lng: -74.7597 },
  "Baltimore, MD": { lat: 39.2904, lng: -76.6122 },
  "Pittsburgh, PA": { lat: 40.4406, lng: -79.9959 },
};

export function lookupCityCoords(cityName: string): Coordinates {
  const coords = CITY_COORDS[cityName];
  if (!coords) {
    throw new Error(
      `No coordinates known for city "${cityName}" — add it to CITY_COORDS in lib/geo.ts.`
    );
  }
  return coords;
}

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(h));
  return EARTH_RADIUS_MILES * c;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts tests/lib/geo.test.ts
git commit -m "feat: add city coordinate lookup and haversine distance"
```

---

## Task 4: `lib/dispatch.ts` — `filterEligibleDrivers`

**Files:**
- Create: `lib/dispatch.ts`
- Test: `tests/lib/dispatch.test.ts`

**Interfaces:**
- Consumes: `lookupCityCoords`, `haversineMiles` from `lib/geo.ts` (Task 3); `Driver`, `Load` types from `@/app/generated/prisma/client`.
- Produces: `EligibleDriver = { driver: Driver; deadheadMiles: number; loadedMiles: number; totalMiles: number }`, `filterEligibleDrivers(load: Load, drivers: Driver[]): EligibleDriver[]`. Task 5 consumes this.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/dispatch.test.ts
import { describe, it, expect } from "vitest";
import { filterEligibleDrivers } from "../../lib/dispatch";
import type { Driver, Load } from "../../app/generated/prisma/client";

function makeDriver(overrides: Partial<Driver>): Driver {
  return {
    id: "driver-1",
    name: "Test Driver",
    currentLat: 40.7128,
    currentLng: -74.006,
    hosRemainingMinutes: 600,
    hos14hrWindowMinutes: 750,
    equipmentType: "Dry Van",
    homeTimePref: null,
    notes: "",
    recentLaneHistory: "[]",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Driver;
}

function makeLoad(overrides: Partial<Load>): Load {
  return {
    id: "load-1",
    origin: "New York, NY",
    destination: "Philadelphia, PA",
    pickupWindow: "2026-07-18 06:00-08:00",
    deliveryWindow: "2026-07-18 10:00-12:00",
    equipmentRequired: "Dry Van",
    plannedRouteGeoJSON: null,
    plannedETA: null,
    revenue: 1000,
    status: "NEW",
    customerEmail: "test@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Load;
}

describe("filterEligibleDrivers", () => {
  it("excludes drivers with the wrong equipment type", () => {
    const load = makeLoad({});
    const drivers = [makeDriver({ id: "d1", equipmentType: "Reefer" })];
    expect(filterEligibleDrivers(load, drivers)).toHaveLength(0);
  });

  it("excludes drivers without enough HOS remaining for the total trip", () => {
    const load = makeLoad({}); // NYC -> Philadelphia, ~80mi loaded
    const drivers = [makeDriver({ id: "d1", hosRemainingMinutes: 5, hos14hrWindowMinutes: 10 })];
    expect(filterEligibleDrivers(load, drivers)).toHaveLength(0);
  });

  it("includes a driver with matching equipment and enough HOS, with correct deadhead", () => {
    const load = makeLoad({});
    const drivers = [makeDriver({ id: "d1" })]; // positioned at NYC, load origin is NYC
    const result = filterEligibleDrivers(load, drivers);
    expect(result).toHaveLength(1);
    expect(result[0].driver.id).toBe("d1");
    expect(result[0].deadheadMiles).toBeCloseTo(0, 0);
    expect(result[0].loadedMiles).toBeGreaterThan(75);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/dispatch.test.ts`
Expected: FAIL — `Cannot find module '../../lib/dispatch'`.

- [ ] **Step 3: Implement `filterEligibleDrivers`**

```ts
// lib/dispatch.ts
import type { Driver, Load } from "@/app/generated/prisma/client";
import { haversineMiles, lookupCityCoords } from "./geo";

const AVERAGE_SPEED_MPH = 50;
const PICKUP_OVERHEAD_MINUTES = 30;
const FUEL_COST_PER_MILE = 0.65;

export type EligibleDriver = {
  driver: Driver;
  deadheadMiles: number;
  loadedMiles: number;
  totalMiles: number;
};

function estimateDriveMinutes(miles: number): number {
  return (miles / AVERAGE_SPEED_MPH) * 60;
}

export function filterEligibleDrivers(load: Load, drivers: Driver[]): EligibleDriver[] {
  const origin = lookupCityCoords(load.origin);
  const destination = lookupCityCoords(load.destination);
  const loadedMiles = haversineMiles(origin, destination);

  return drivers
    .filter((driver) => driver.equipmentType === load.equipmentRequired)
    .map((driver) => {
      const deadheadMiles = haversineMiles({ lat: driver.currentLat, lng: driver.currentLng }, origin);
      const totalMiles = deadheadMiles + loadedMiles;
      return { driver, deadheadMiles, loadedMiles, totalMiles };
    })
    .filter(({ driver, totalMiles }) => {
      const driveMinutes = estimateDriveMinutes(totalMiles);
      const onDutyMinutes = driveMinutes + PICKUP_OVERHEAD_MINUTES;
      return driver.hosRemainingMinutes >= driveMinutes && driver.hos14hrWindowMinutes >= onDutyMinutes;
    });
}

export { AVERAGE_SPEED_MPH, PICKUP_OVERHEAD_MINUTES, FUEL_COST_PER_MILE, estimateDriveMinutes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/dispatch.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/dispatch.ts tests/lib/dispatch.test.ts
git commit -m "feat: add deterministic HOS/equipment eligibility filter"
```

---

## Task 5: `lib/dispatch.ts` — `scoreDrivers` and `topCandidates`

**Files:**
- Modify: `lib/dispatch.ts` (append to the file from Task 4)
- Test: `tests/lib/dispatch.test.ts` (append to the file from Task 4)

**Interfaces:**
- Consumes: `EligibleDriver`, `FUEL_COST_PER_MILE` from Task 4 (same file).
- Produces: `ScoredDriver = { driverId: string; driver: Driver; hosOk: true; deadheadMiles: number; fuelCost: number; tomorrowConflict: boolean }`, `scoreDrivers(eligible: EligibleDriver[], busyDriverIds: Set<string>): ScoredDriver[]` (sorted ascending by fuel cost), `topCandidates(scored: ScoredDriver[], count?: number): ScoredDriver[]`. Task 6 (`getDispatchRecommendation`) and Task 7 (route handler) consume these.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/dispatch.test.ts`:

```ts
import { scoreDrivers, topCandidates } from "../../lib/dispatch";

describe("scoreDrivers + topCandidates", () => {
  it("sorts ascending by fuel cost and flags busy drivers as tomorrowConflict", () => {
    const load = makeLoad({});
    const drivers = [
      makeDriver({ id: "far", currentLat: 40.4406, currentLng: -79.9959 }), // Pittsburgh - bigger deadhead
      makeDriver({ id: "near", currentLat: 40.7128, currentLng: -74.006 }), // NYC - tiny deadhead
    ];
    const eligible = filterEligibleDrivers(load, drivers);
    const scored = scoreDrivers(eligible, new Set(["near"]));

    expect(scored[0].driverId).toBe("near");
    expect(scored[0].tomorrowConflict).toBe(true);
    expect(scored[1].driverId).toBe("far");
    expect(scored[1].tomorrowConflict).toBe(false);
    expect(scored[0].fuelCost).toBeLessThan(scored[1].fuelCost);
  });

  it("topCandidates slices to the requested count", () => {
    const load = makeLoad({});
    const drivers = [
      makeDriver({ id: "a", currentLat: 40.7128, currentLng: -74.006 }),
      makeDriver({ id: "b", currentLat: 40.4406, currentLng: -79.9959 }),
      makeDriver({ id: "c", currentLat: 39.2904, currentLng: -76.6122 }),
    ];
    const scored = scoreDrivers(filterEligibleDrivers(load, drivers), new Set());
    expect(topCandidates(scored, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/dispatch.test.ts`
Expected: FAIL — `scoreDrivers is not a function` / `topCandidates is not a function`.

- [ ] **Step 3: Implement `scoreDrivers` and `topCandidates`**

Append to `lib/dispatch.ts`:

```ts
export type ScoredDriver = {
  driverId: string;
  driver: Driver;
  hosOk: true;
  deadheadMiles: number;
  fuelCost: number;
  tomorrowConflict: boolean;
};

export function scoreDrivers(eligible: EligibleDriver[], busyDriverIds: Set<string>): ScoredDriver[] {
  return eligible
    .map(({ driver, deadheadMiles, totalMiles }) => ({
      driverId: driver.id,
      driver,
      hosOk: true as const,
      deadheadMiles,
      fuelCost: Math.round(totalMiles * FUEL_COST_PER_MILE * 100) / 100,
      tomorrowConflict: busyDriverIds.has(driver.id),
    }))
    .sort((a, b) => a.fuelCost - b.fuelCost || a.deadheadMiles - b.deadheadMiles);
}

export function topCandidates(scored: ScoredDriver[], count = 3): ScoredDriver[] {
  return scored.slice(0, count);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/dispatch.test.ts`
Expected: `5 passed` (3 from Task 4 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/dispatch.ts tests/lib/dispatch.test.ts
git commit -m "feat: add cost scoring and top-candidate selection"
```

---

## Task 6: `lib/dispatch-llm.ts` — schema, validation guard, and the LLM call

**Files:**
- Create: `lib/dispatch-llm.ts`
- Test: `tests/lib/dispatch-llm.test.ts`

**Interfaces:**
- Consumes: `callLLM`, `LLMFallbackError` from `lib/llm.ts`; `ScoredDriver` from `lib/dispatch.ts` (Task 5); `Load` from `@/app/generated/prisma/client`.
- Produces: `RankedDispatchSchema` (Zod), `validateRecommendation(raw, allowedDriverIds): RankedDispatchLLMResult | null`, `DispatchRecommendationResult = RankedDispatchLLMResult & { degraded: boolean }`, `getDispatchRecommendation(load: Load, candidates: ScoredDriver[]): Promise<DispatchRecommendationResult>`. Task 7 (route handler) consumes `getDispatchRecommendation`.

- [ ] **Step 1: Write the failing test for the pure validation guard**

`validateRecommendation` is the piece implementing spec §4's hard rule ("never let the LLM output include a driver outside the 3 it was given") — it's pure and network-free, so it gets a real unit test. `getDispatchRecommendation` itself calls the network and is covered by Task 10's manual verification instead.

```ts
// tests/lib/dispatch-llm.test.ts
import { describe, it, expect } from "vitest";
import { validateRecommendation } from "../../lib/dispatch-llm";

describe("validateRecommendation", () => {
  const base = {
    rankedDriverIds: ["a", "b", "c"],
    recommendedDriverId: "a",
    rationale: "test rationale",
    tieFlag: false,
    confidence: "high" as const,
  };

  it("accepts a recommendation entirely within the allowed set", () => {
    expect(validateRecommendation(base, ["a", "b", "c"])).toEqual(base);
  });

  it("rejects a recommendedDriverId outside the allowed set", () => {
    expect(validateRecommendation({ ...base, recommendedDriverId: "z" }, ["a", "b", "c"])).toBeNull();
  });

  it("rejects when rankedDriverIds includes an id outside the allowed set", () => {
    expect(
      validateRecommendation({ ...base, rankedDriverIds: ["a", "b", "z"] }, ["a", "b", "c"])
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/dispatch-llm.test.ts`
Expected: FAIL — `Cannot find module '../../lib/dispatch-llm'`.

- [ ] **Step 3: Implement `lib/dispatch-llm.ts`**

```ts
import { z } from "zod";
import { callLLM, LLMFallbackError } from "./llm";
import type { Load } from "@/app/generated/prisma/client";
import type { ScoredDriver } from "./dispatch";

export const RankedDispatchSchema = z.object({
  rankedDriverIds: z.array(z.string()),
  recommendedDriverId: z.string(),
  rationale: z.string(),
  tieFlag: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RankedDispatchLLMResult = z.infer<typeof RankedDispatchSchema>;
export type DispatchRecommendationResult = RankedDispatchLLMResult & { degraded: boolean };

// Spec §4 hard rule: the LLM may only recommend one of the 3 drivers it was
// actually given. A model that names an unknown id is treated exactly like
// a schema-validation failure, never trusted past this check.
export function validateRecommendation(
  raw: RankedDispatchLLMResult,
  allowedDriverIds: string[]
): RankedDispatchLLMResult | null {
  const allowed = new Set(allowedDriverIds);
  if (!allowed.has(raw.recommendedDriverId)) return null;
  if (!raw.rankedDriverIds.every((id) => allowed.has(id))) return null;
  return raw;
}

function buildPrompt(load: Load, candidates: ScoredDriver[]) {
  const system = `You are helping a truck dispatcher choose the best driver for a load.
You will be given 3 pre-filtered, HOS-eligible drivers with computed stats,
plus their free-text notes/preferences if any. Rank them and recommend one.
If a driver has notes that suggest they shouldn't take this load (bad lane
history, stated preference against it) even if they're cheapest, factor
that in and explain why. Return ONLY valid JSON matching this schema:
{ "rankedDriverIds": [string], "recommendedDriverId": string,
  "rationale": string (2-3 sentences, plain language),
  "tieFlag": boolean, "confidence": "high"|"medium"|"low" }`;

  const candidateLines = candidates
    .map(
      (c, i) =>
        `${i + 1}. Driver ${c.driverId}: HOS remaining ${Math.round(
          c.driver.hosRemainingMinutes / 60
        )}h, deadhead ${Math.round(c.deadheadMiles)}mi, fuel cost $${c.fuelCost.toFixed(2)}, tomorrow-conflict: ${
          c.tomorrowConflict
        }, notes: "${c.driver.notes || "none"}"`
    )
    .join("\n");

  const user = `Load: ${load.origin} to ${load.destination}, pickup ${load.pickupWindow}, equipment ${load.equipmentRequired}.
Candidates:
${candidateLines}`;

  return { system, user };
}

function degradedResult(candidates: ScoredDriver[]): DispatchRecommendationResult {
  const top1 = candidates[0];
  return {
    rankedDriverIds: candidates.map((c) => c.driverId),
    recommendedDriverId: top1.driverId,
    rationale: "",
    tieFlag: false,
    confidence: "low",
    degraded: true,
  };
}

export async function getDispatchRecommendation(
  load: Load,
  candidates: ScoredDriver[]
): Promise<DispatchRecommendationResult> {
  const { system, user } = buildPrompt(load, candidates);
  const allowedIds = candidates.map((c) => c.driverId);

  try {
    const raw = await callLLM({ systemPrompt: system, userPrompt: user }, RankedDispatchSchema);
    const validated = validateRecommendation(raw, allowedIds);
    if (!validated) return degradedResult(candidates);
    return { ...validated, degraded: false };
  } catch (err) {
    if (err instanceof LLMFallbackError) return degradedResult(candidates);
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/dispatch-llm.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/dispatch-llm.ts tests/lib/dispatch-llm.test.ts
git commit -m "feat: add dispatch LLM call with recommendation-id validation guard"
```

---

## Task 7: `app/api/loads/[id]/recommend/route.ts` — the compute endpoint

**Files:**
- Create: `app/api/loads/[id]/recommend/route.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`), `filterEligibleDrivers`/`scoreDrivers`/`topCandidates` (`lib/dispatch.ts`), `getDispatchRecommendation` (`lib/dispatch-llm.ts`).
- Produces: `POST /api/loads/:id/recommend` → `{ status: "no_eligible_drivers" }` or `{ status: "ok", recommendation, top3 }`. Task 9's client component calls this.

- [ ] **Step 1: Implement the route handler**

```ts
// app/api/loads/[id]/recommend/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { filterEligibleDrivers, scoreDrivers, topCandidates } from "@/lib/dispatch";
import { getDispatchRecommendation } from "@/lib/dispatch-llm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loadId } = await params;

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  const [drivers, activeAssignments] = await Promise.all([
    prisma.driver.findMany(),
    prisma.assignment.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] } },
      select: { driverId: true },
    }),
  ]);
  const busyDriverIds = new Set(activeAssignments.map((a) => a.driverId));

  const eligible = filterEligibleDrivers(load, drivers);
  if (eligible.length === 0) {
    return NextResponse.json({ status: "no_eligible_drivers" as const });
  }

  const scored = scoreDrivers(eligible, busyDriverIds);
  const top3 = topCandidates(scored, 3);
  const result = await getDispatchRecommendation(load, top3);

  const recommendation = await prisma.recommendation.create({
    data: {
      loadId,
      rankedDrivers: JSON.stringify(
        top3.map((c) => ({
          driverId: c.driverId,
          hosOk: true,
          deadheadMiles: c.deadheadMiles,
          fuelCost: c.fuelCost,
          tomorrowConflict: c.tomorrowConflict,
        }))
      ),
      recommendedDriverId: result.recommendedDriverId,
      rationale: result.rationale,
      tieFlag: result.tieFlag,
      confidence: result.confidence,
      degraded: result.degraded,
    },
  });

  return NextResponse.json({ status: "ok" as const, recommendation, top3 });
}
```

- [ ] **Step 2: Verify it compiles and the route resolves**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev` (in the background), then in another shell:
```bash
LOAD_ID=$(sqlite3 dev.db "select id from Load where destination='Newark, NJ';")
curl -s -X POST "http://localhost:3000/api/loads/$LOAD_ID/recommend" | head -c 2000
```
Expected: JSON with `"status":"ok"` and a `recommendation` object with `recommendedDriverId` set to one of Priya's/Marcus's ids (not Alice's, given her notes) — read the console log from `npm run dev` to see the actual prompt and LLM response.

- [ ] **Step 3: Commit**

```bash
git add app/api/loads/\[id\]/recommend/route.ts
git commit -m "feat: add recommend route handler"
```

---

## Task 8: `app/dispatch/page.tsx` — Load list

**Files:**
- Create: `app/dispatch/page.tsx`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`).
- Produces: the `/dispatch` route, linked from `app/layout.tsx`'s nav (already built in Task Group 0).

- [ ] **Step 1: Implement the page**

```tsx
// app/dispatch/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function DispatchPage() {
  const loads = await prisma.load.findMany({
    where: { status: { in: ["NEW", "ASSIGNED"] } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Loads awaiting dispatch</h1>
      <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {loads.map((load) => (
          <Link
            key={load.id}
            href={`/dispatch/${load.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium">
                {load.origin} → {load.destination}
              </p>
              <p className="text-sm text-zinc-500">
                {load.equipmentRequired} · Pickup {load.pickupWindow}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">${load.revenue.toFixed(0)}</p>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{load.status}</p>
            </div>
          </Link>
        ))}
        {loads.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No loads awaiting dispatch.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run dev`, open `http://localhost:3000/dispatch`.
Expected: a list of NEW/ASSIGNED loads, each a clickable link (targets 404 until Task 9 lands — that's fine).

- [ ] **Step 3: Commit**

```bash
git add app/dispatch/page.tsx
git commit -m "feat: add dispatch load list page"
```

---

## Task 9: Load Detail screen — page, RecommendationPanel, and the assign action

**Files:**
- Create: `app/dispatch/[id]/page.tsx`
- Create: `app/dispatch/[id]/RecommendationPanel.tsx`
- Create: `app/dispatch/[id]/actions.ts`

**Interfaces:**
- Consumes: `prisma`, `filterEligibleDrivers`/`scoreDrivers` (`lib/dispatch.ts`), `AiBadge` (`components/AiBadge.tsx`).
- Produces: the `/dispatch/[id]` route and `assignDriver(loadId, driverId, overrideReason?): Promise<void>` (Server Action).

- [ ] **Step 1: Implement the Server Action**

```ts
// app/dispatch/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function assignDriver(loadId: string, driverId: string, overrideReason?: string) {
  const recommendation = await prisma.recommendation.findFirst({
    where: { loadId },
    orderBy: { computedAt: "desc" },
  });
  const wasRecommended = recommendation?.recommendedDriverId === driverId;

  if (!wasRecommended && !overrideReason?.trim()) {
    throw new Error(
      "An override reason is required when assigning a driver other than the recommended one."
    );
  }

  await prisma.assignment.create({
    data: {
      loadId,
      driverId,
      wasRecommended,
      overrideReason: wasRecommended ? null : overrideReason,
      status: "PENDING",
    },
  });

  await prisma.load.update({ where: { id: loadId }, data: { status: "ASSIGNED" } });

  revalidatePath(`/dispatch/${loadId}`);
  revalidatePath("/dispatch");
}
```

- [ ] **Step 2: Implement the Server Component page**

```tsx
// app/dispatch/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { filterEligibleDrivers, scoreDrivers } from "@/lib/dispatch";
import { RecommendationPanel } from "./RecommendationPanel";

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const load = await prisma.load.findUnique({ where: { id } });
  if (!load) notFound();

  const [drivers, activeAssignments, latestRecommendation] = await Promise.all([
    prisma.driver.findMany(),
    prisma.assignment.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] } },
      select: { driverId: true },
    }),
    prisma.recommendation.findFirst({ where: { loadId: id }, orderBy: { computedAt: "desc" } }),
  ]);

  const busyDriverIds = new Set(activeAssignments.map((a) => a.driverId));
  const eligible = filterEligibleDrivers(load, drivers);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {load.origin} → {load.destination}
        </h1>
        <p className="text-sm text-zinc-500">
          {load.equipmentRequired} · Pickup {load.pickupWindow} · ${load.revenue.toFixed(0)}
        </p>
      </div>

      {eligible.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No eligible driver: no driver in the fleet has the required equipment (
          {load.equipmentRequired}) with enough HOS remaining for this load.
        </p>
      ) : (
        <RecommendationPanel
          load={load}
          scored={scoreDrivers(eligible, busyDriverIds)}
          cachedRecommendation={
            latestRecommendation
              ? {
                  recommendedDriverId: latestRecommendation.recommendedDriverId,
                  rationale: latestRecommendation.rationale,
                  tieFlag: latestRecommendation.tieFlag,
                  confidence: latestRecommendation.confidence,
                  degraded: latestRecommendation.degraded,
                }
              : null
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the client RecommendationPanel**

```tsx
// app/dispatch/[id]/RecommendationPanel.tsx
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
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/dispatch/\[id\]/page.tsx app/dispatch/\[id\]/RecommendationPanel.tsx app/dispatch/\[id\]/actions.ts
git commit -m "feat: add load detail screen with live recommendation and assign action"
```

---

## Task 10: Manual verification pass

No further code changes — this task is the gate before Task Group 2 starts, matching the roadmap's verification list.

- [ ] **Step 1: Run the full automated suite**

```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: all pass with no errors.

- [ ] **Step 2: No-eligible-driver empty state**

`npm run dev`, open `/dispatch`, open the Denver→Salt Lake City (`Step Deck`) load.
Expected: the amber "No eligible driver" message, not a crash or blank page.

- [ ] **Step 3: No-route load renders fine**

Open the Portland OR → Boise ID load.
Expected: renders normally (this field only matters for Task Group 3's route monitoring, not dispatch).

- [ ] **Step 4: Flagship soft-context-flip case**

Open the Trenton, NJ → Newark, NJ load (seeded in Task 2).
Expected: 3 candidates (Alice, Priya, Marcus) render; Alice has the lowest deadhead/fuel cost but the recommended driver is Priya or Marcus, with a rationale (behind the `AiBadge`) explaining that Alice's notes about avoiding NYC-metro drop-offs ruled her out despite being cheapest. Read the actual LLM response from the `npm run dev` console log to confirm this is what the model said, not an assumption.

- [ ] **Step 5: Override-reason requirement**

On any load with a recommendation, click Assign on a non-recommended driver.
Expected: an inline text input appears and "Confirm assign" is disabled until text is entered; after confirming, `sqlite3 dev.db "select overrideReason, wasRecommended from Assignment order by createdAt desc limit 1;"` shows the reason stored and `wasRecommended = 0`.

- [ ] **Step 6: Deterministic fallback mode**

Temporarily blank `GEMINI_API_KEY` in `.env.local`, restart `npm run dev`, click Recompute on a load.
Expected: the recommendation still renders (deterministic top-1, no rationale, `degraded: true` noted in the UI), not a broken page. Restore the real key afterward.

- [ ] **Step 7: Commit any fixes found during verification, then stop**

If everything passes with no code changes needed, there's nothing to commit — Task Group 1 is done. Report back before starting Task Group 2's plan.
