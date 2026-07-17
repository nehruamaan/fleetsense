# Proactive Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FleetSense's Proactive Alerts feature (build spec §6) — deterministic detection compares each in-transit load's recorded positions against its planned route/ETA to flag ETA slips, route deviations, prolonged dwells, and contact loss; a real Gemini call explains the likely cause, sets a priority, and drafts a message; a hard-coded rule forces HIGH priority for a possible-breakdown dwell pattern regardless of what the model says; a dispatcher approves, edits, or dismisses — nothing sends without a click.

**Architecture:** A pure detection module (`lib/exceptions.ts`) operates entirely on already-recorded `PositionUpdate` timestamps and a *derived* "simulated now" (the latest `recordedAt` across the whole table) rather than the real wall clock — this makes detection deterministic and repeatable no matter how much real time has passed since the demo data was seeded. An LLM module (`lib/exceptions-llm.ts`) wraps the existing `callLLM` and applies the hard-coded priority override both on the success path and the fallback path. A single Server Action (`advanceSimulation`) is the manual trigger for the "background check" the spec describes — it re-runs detection and creates `Exception` rows idempotently (never re-detecting/re-calling the LLM for an exception already tracked for that load+type).

**Tech Stack:** Next.js 16 App Router, Prisma 7 via `lib/prisma.ts`, Zod, `lib/llm.ts`'s `callLLM`, Vitest.

## Global Constraints

- Every LLM call goes through `lib/llm.ts`'s `callLLM<T>(options, zodSchema)`.
- Every DB access goes through the `prisma` singleton from `lib/prisma.ts`.
- **Deterministic detection has zero LLM involvement** (spec §6 step 1) — `lib/exceptions.ts` must not import `lib/llm.ts` or `lib/exceptions-llm.ts` at all.
- **Hard rule (spec §6 step 3):** if a detected pattern is `DWELL` and its duration meets/exceeds the possible-breakdown threshold, `priority` is forced to `HIGH` regardless of what the LLM returned — enforced in code in `lib/exceptions-llm.ts`, on **both** the success path and the deterministic-fallback path (a down API must not weaken this safety property).
- No LLM output executes an action directly — `advanceSimulation` only creates `Exception` rows from *deterministically detected* candidates; the LLM only fills in `aiRead`/`draftMessage`/`priority` (subject to the hard override) on an exception that already exists for a real, code-detected reason. Sending/approving is always a human click (`approveException`/`dismissException`).
- AI-generated text (`aiRead`, `draftMessage`) is wrapped in `AiBadge` (`components/AiBadge.tsx`).
- Idempotency: `advanceSimulation` must not create a duplicate `Exception` (and must not re-call the LLM) for a load+type that already has an `OPEN` or `APPROVED` exception tracked.
- Fold setup/config into the task that needs it; don't add speculative abstractions beyond what this plan specifies.
- **This branch (`feature/proactive-alerts`) was branched from `main`, independent of the `feature/smart-dispatch` branch that also created a `lib/geo.ts`.** Per the user's explicit branch-workflow preference (see project memory), each feature branch stays independent until all three are done and reviewed, then merged one at a time via PR. This means `lib/geo.ts` is *recreated here* with the same `haversineMiles`/`lookupCityCoords` content as the Smart Dispatch branch, plus one addition (`distanceFromRouteMiles`) this feature needs. **Flag this to the user when Task Group 3 is done**: merging `feature/smart-dispatch` and `feature/proactive-alerts` into `main` in sequence will likely hit a `lib/geo.ts` merge conflict, since both branches independently create/extend the same file — this is an expected, disclosed consequence of the per-branch workflow, not a bug, and should be resolved by hand (or by re-running one branch's Task 2 against the other's already-merged version) at merge time.

## Seed data this feature already has (do not re-seed)

- **Clean in-transit trace:** New York → Cleveland, 4 `PositionUpdate` points steadily progressing along the route, ending near the destination.
- **ETA-slip trace:** Chicago → Indianapolis, points show the truck well behind where it needs to be relative to `plannedETA`, still short of the destination.
- **Ambiguous-dwell trace:** Atlanta → Charlotte, 5 stationary points clustered off the planned route line — deliberately gives the LLM no explanatory signal, so the honest answer is "unexplained deviation" (spec §6/§8 demo item 6).
- No seeded scenario specifically demonstrates `CONTACT_LOSS` — that detector still needs to exist and be correct, it just won't have a dedicated demo moment; verify it doesn't false-positive on the three seeded traces (see Task 7).

## A note on thresholds

The exact numeric thresholds below (`ETA_SLIP_THRESHOLD_MINUTES = 90`, etc.) are a considered starting point based on manually estimating the seeded traces' geometry, **not a value to treat as gospel**. Task 7's manual verification explicitly computes the real numbers against the live seed data — if the clean trace ends up flagging a slip, or the slip trace doesn't, adjust the constant and re-verify. Getting this exactly right by hand-calculating haversine distances across several points is error-prone; treat Task 7 as the actual source of truth, not this plan's guess.

---

## Task 1: Add Vitest

Identical setup to the sibling branches (`main` doesn't have it).

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1:** `npm install -D vitest`

- [ ] **Step 2:** Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3:** Add to `package.json`'s `"scripts"`: `"test": "vitest run"`

- [ ] **Step 4:** Verify with a throwaway smoke test (`tests/lib/smoke.test.ts`, `expect(1+1).toBe(2)`), run `npm test`, expect `1 passed`, then delete the smoke test.

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest"
```

---

## Task 2: `lib/geo.ts` — coordinates, haversine, and point-to-segment distance

**Files:**
- Create: `lib/geo.ts`
- Test: `tests/lib/geo.test.ts`

**Interfaces:**
- Produces: `Coordinates`, `lookupCityCoords(cityName: string): Coordinates`, `haversineMiles(a: Coordinates, b: Coordinates): number` (same as the sibling Smart Dispatch branch's version), plus **new**: `distanceFromRouteMiles(point: Coordinates, routeStart: Coordinates, routeEnd: Coordinates): number` — perpendicular distance from `point` to the line segment `routeStart`→`routeEnd`, clamped to the segment's endpoints. Task 3 (`lib/exceptions.ts`) consumes all four.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/geo.test.ts
import { describe, it, expect } from "vitest";
import { haversineMiles, lookupCityCoords, distanceFromRouteMiles } from "../../lib/geo";

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

describe("distanceFromRouteMiles", () => {
  it("returns ~0 for a point sitting exactly on the segment's midpoint", () => {
    const start = { lat: 40.0, lng: -80.0 };
    const end = { lat: 42.0, lng: -80.0 };
    const midpoint = { lat: 41.0, lng: -80.0 };
    expect(distanceFromRouteMiles(midpoint, start, end)).toBeLessThan(1);
  });

  it("returns a large distance for a point far off the line", () => {
    const start = { lat: 40.0, lng: -80.0 };
    const end = { lat: 42.0, lng: -80.0 };
    const farPoint = { lat: 41.0, lng: -75.0 }; // several degrees of longitude away
    expect(distanceFromRouteMiles(farPoint, start, end)).toBeGreaterThan(100);
  });

  it("clamps to the nearest endpoint when the closest point on the infinite line falls outside the segment", () => {
    const start = { lat: 40.0, lng: -80.0 };
    const end = { lat: 42.0, lng: -80.0 };
    const beyondEnd = { lat: 45.0, lng: -80.0 }; // past `end`, along the same line
    const distanceToEnd = haversineMiles(beyondEnd, end);
    expect(distanceFromRouteMiles(beyondEnd, start, end)).toBeCloseTo(distanceToEnd, 0);
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

// Perpendicular distance from `point` to the segment routeStart->routeEnd,
// clamped to the segment (never extrapolated past either endpoint).
// Uses a locally-flattened planar approximation (longitude scaled by
// cos(latitude)) -- accurate enough for the short/medium route segments
// this demo uses, not meant for geodesic-precision routing.
export function distanceFromRouteMiles(
  point: Coordinates,
  routeStart: Coordinates,
  routeEnd: Coordinates
): number {
  const latScale = Math.cos((routeStart.lat * Math.PI) / 180);
  const toXY = (c: Coordinates) => ({ x: c.lng * latScale, y: c.lat });

  const p = toXY(point);
  const a = toXY(routeStart);
  const b = toXY(routeEnd);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;

  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closest: Coordinates = {
    lat: a.y + t * aby,
    lng: (a.x + t * abx) / latScale,
  };

  return haversineMiles(point, closest);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts tests/lib/geo.test.ts
git commit -m "feat: add city coordinate lookup, haversine distance, and point-to-route distance"
```

---

## Task 3: `lib/exceptions.ts` — deterministic detection

**Files:**
- Create: `lib/exceptions.ts`
- Test: `tests/lib/exceptions.test.ts`

**Interfaces:**
- Consumes: `haversineMiles`, `lookupCityCoords`, `distanceFromRouteMiles` from `lib/geo.ts`; `Load`, `PositionUpdate` types from `@/app/generated/prisma/client`.
- Produces: `ExceptionType = "ETA_SLIP" | "ROUTE_DEVIATION" | "DWELL" | "CONTACT_LOSS"`, `ExceptionCandidate = { type: ExceptionType; magnitude: string; durationMinutes?: number }`, `detectExceptions(load: Load, positions: PositionUpdate[], simulatedNow: Date): ExceptionCandidate[]`. Task 4 (`lib/exceptions-llm.ts`, specifically its hard-override logic) reads `candidate.type`/`candidate.durationMinutes`; Task 6 (the Server Action) calls `detectExceptions` directly.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/exceptions.test.ts
import { describe, it, expect } from "vitest";
import { detectExceptions } from "../../lib/exceptions";
import type { Load, PositionUpdate } from "../../app/generated/prisma/client";

function makeLoad(overrides: Partial<Load>): Load {
  return {
    id: "load-1",
    origin: "New York, NY",
    destination: "Cleveland, OH",
    pickupWindow: "2026-07-16 06:00-08:00",
    deliveryWindow: "2026-07-16 20:00-22:00",
    equipmentRequired: "Dry Van",
    plannedRouteGeoJSON: JSON.stringify({
      type: "LineString",
      coordinates: [
        [-74.006, 40.7128],
        [-81.6944, 41.4993],
      ],
    }),
    plannedETA: new Date("2026-07-16T18:00:00Z"),
    revenue: 1000,
    status: "IN_TRANSIT",
    customerEmail: "test@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Load;
}

function makePosition(overrides: Partial<PositionUpdate>): PositionUpdate {
  return {
    id: "pos-1",
    loadId: "load-1",
    lat: 40.7128,
    lng: -74.006,
    recordedAt: new Date(),
    ...overrides,
  } as PositionUpdate;
}

const NOW = new Date("2026-07-16T20:00:00Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("detectExceptions", () => {
  it("flags nothing for a clean, on-route, on-time trace", () => {
    const load = makeLoad({ plannedETA: hoursBefore(-2) }); // ETA is 2 hours in the future relative to NOW
    const positions = [
      makePosition({ lat: 40.71, lng: -74.0, recordedAt: hoursBefore(4) }),
      makePosition({ lat: 41.0, lng: -78.0, recordedAt: hoursBefore(2) }),
      makePosition({ lat: 41.3, lng: -80.5, recordedAt: hoursBefore(0.5) }),
    ];
    expect(detectExceptions(load, positions, NOW)).toEqual([]);
  });

  it("flags DWELL for positions clustered off-route for a long duration, with durationMinutes set", () => {
    const load = makeLoad({});
    const offRoute = { lat: 39.0, lng: -78.0 }; // well off the NY->Cleveland line
    const positions = [
      makePosition({ ...offRoute, recordedAt: hoursBefore(4) }),
      makePosition({ ...offRoute, recordedAt: hoursBefore(3) }),
      makePosition({ ...offRoute, recordedAt: hoursBefore(2) }),
      makePosition({ ...offRoute, recordedAt: hoursBefore(1) }),
    ];
    const results = detectExceptions(load, positions, NOW);
    const dwell = results.find((r) => r.type === "DWELL");
    expect(dwell).toBeDefined();
    expect(dwell?.durationMinutes).toBeGreaterThanOrEqual(180);
  });

  it("flags ROUTE_DEVIATION for a position far from the planned line, when not also dwelling", () => {
    const load = makeLoad({});
    const positions = [
      makePosition({ lat: 40.71, lng: -74.0, recordedAt: hoursBefore(2) }),
      makePosition({ lat: 38.0, lng: -78.0, recordedAt: hoursBefore(1) }), // moved, but well off-line
    ];
    const results = detectExceptions(load, positions, NOW);
    expect(results.some((r) => r.type === "ROUTE_DEVIATION")).toBe(true);
  });

  it("flags ETA_SLIP when projected arrival is well past the planned ETA", () => {
    const load = makeLoad({ plannedETA: hoursBefore(6) }); // ETA was already 6 hours ago
    const positions = [
      makePosition({ lat: 41.88, lng: -87.63, recordedAt: hoursBefore(8) }),
      makePosition({ lat: 41.1, lng: -87.3, recordedAt: hoursBefore(6) }),
      makePosition({ lat: 40.3, lng: -87.0, recordedAt: hoursBefore(4) }),
      makePosition({ lat: 39.9, lng: -86.7, recordedAt: hoursBefore(2) }),
    ];
    const slipLoad = makeLoad({
      destination: "Indianapolis, IN",
      plannedETA: hoursBefore(6),
      plannedRouteGeoJSON: JSON.stringify({
        type: "LineString",
        coordinates: [
          [-87.63, 41.88],
          [-86.1581, 39.7684],
        ],
      }),
    });
    const results = detectExceptions(slipLoad, positions, NOW);
    expect(results.some((r) => r.type === "ETA_SLIP")).toBe(true);
  });

  it("flags CONTACT_LOSS when the last update is far in the past relative to simulatedNow", () => {
    const load = makeLoad({});
    const positions = [makePosition({ recordedAt: hoursBefore(10) })];
    const results = detectExceptions(load, positions, NOW);
    expect(results.some((r) => r.type === "CONTACT_LOSS")).toBe(true);
  });

  it("returns an empty array when there are no position updates at all", () => {
    const load = makeLoad({});
    expect(detectExceptions(load, [], NOW)).toEqual([]);
  });

  it("returns no ROUTE_DEVIATION or ETA_SLIP for a not_monitored load (null plannedRouteGeoJSON), without crashing", () => {
    const load = makeLoad({ plannedRouteGeoJSON: null, plannedETA: null });
    const positions = [
      makePosition({ lat: 40.71, lng: -74.0, recordedAt: hoursBefore(2) }),
      makePosition({ lat: 41.0, lng: -78.0, recordedAt: hoursBefore(1) }),
    ];
    expect(() => detectExceptions(load, positions, NOW)).not.toThrow();
    const results = detectExceptions(load, positions, NOW);
    expect(results.some((r) => r.type === "ROUTE_DEVIATION" || r.type === "ETA_SLIP")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/exceptions.test.ts`
Expected: FAIL — `Cannot find module '../../lib/exceptions'`.

- [ ] **Step 3: Implement `lib/exceptions.ts`**

```ts
import type { Load, PositionUpdate } from "@/app/generated/prisma/client";
import { haversineMiles, lookupCityCoords, distanceFromRouteMiles, type Coordinates } from "./geo";

export const ETA_SLIP_THRESHOLD_MINUTES = 90;
export const ROUTE_DEVIATION_THRESHOLD_MILES = 15;
export const DWELL_STATIONARY_RADIUS_MILES = 1;
export const DWELL_THRESHOLD_MINUTES = 90;
export const DWELL_BREAKDOWN_THRESHOLD_MINUTES = 120;
export const CONTACT_LOSS_THRESHOLD_MINUTES = 180;

export type ExceptionType = "ETA_SLIP" | "ROUTE_DEVIATION" | "DWELL" | "CONTACT_LOSS";

export type ExceptionCandidate = {
  type: ExceptionType;
  magnitude: string;
  durationMinutes?: number;
};

function sortByTime(positions: PositionUpdate[]): PositionUpdate[] {
  return [...positions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

function totalDistanceMiles(sorted: PositionUpdate[]): number {
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    total += haversineMiles(
      { lat: sorted[i - 1].lat, lng: sorted[i - 1].lng },
      { lat: sorted[i].lat, lng: sorted[i].lng }
    );
  }
  return total;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h${mins > 0 ? `${mins}m` : ""}`;
}

function parseRoute(load: Load): { start: Coordinates; end: Coordinates } | null {
  if (!load.plannedRouteGeoJSON) return null;
  const parsed = JSON.parse(load.plannedRouteGeoJSON) as { coordinates: [number, number][] };
  const [startLng, startLat] = parsed.coordinates[0];
  const [endLng, endLat] = parsed.coordinates[parsed.coordinates.length - 1];
  return { start: { lat: startLat, lng: startLng }, end: { lat: endLat, lng: endLng } };
}

function detectDwell(load: Load, sorted: PositionUpdate[]): ExceptionCandidate | null {
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spreadMiles = totalDistanceMiles(sorted);
  if (spreadMiles >= DWELL_STATIONARY_RADIUS_MILES) return null;

  const durationMinutes = (last.recordedAt.getTime() - first.recordedAt.getTime()) / 60000;
  if (durationMinutes < DWELL_THRESHOLD_MINUTES) return null;

  const route = parseRoute(load);
  const offRouteMiles = route
    ? distanceFromRouteMiles({ lat: last.lat, lng: last.lng }, route.start, route.end)
    : 0;

  return {
    type: "DWELL",
    magnitude: `stopped ${formatDuration(durationMinutes)}, ${Math.round(offRouteMiles)}mi off planned route`,
    durationMinutes,
  };
}

function detectRouteDeviation(load: Load, sorted: PositionUpdate[]): ExceptionCandidate | null {
  const route = parseRoute(load);
  if (!route || sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const distance = distanceFromRouteMiles({ lat: last.lat, lng: last.lng }, route.start, route.end);
  if (distance <= ROUTE_DEVIATION_THRESHOLD_MILES) return null;
  return { type: "ROUTE_DEVIATION", magnitude: `${Math.round(distance)}mi off planned route` };
}

function detectEtaSlip(load: Load, sorted: PositionUpdate[]): ExceptionCandidate | null {
  if (!load.plannedETA || sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const elapsedHours = (last.recordedAt.getTime() - first.recordedAt.getTime()) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return null;

  const traveledMiles = totalDistanceMiles(sorted);
  const speedMph = traveledMiles / elapsedHours;
  if (speedMph < 5) return null; // too little movement to project a speed -- dwell/deviation handle stationary cases

  const destination = lookupCityCoords(load.destination);
  const remainingMiles = haversineMiles({ lat: last.lat, lng: last.lng }, destination);
  const remainingHours = remainingMiles / speedMph;
  const projectedArrival = new Date(last.recordedAt.getTime() + remainingHours * 60 * 60 * 1000);

  const lateMinutes = (projectedArrival.getTime() - load.plannedETA.getTime()) / 60000;
  if (lateMinutes <= ETA_SLIP_THRESHOLD_MINUTES) return null;

  return {
    type: "ETA_SLIP",
    magnitude: `projected ${formatDuration(lateMinutes)} late (planned ETA ${load.plannedETA.toISOString()})`,
  };
}

function detectContactLoss(sorted: PositionUpdate[], simulatedNow: Date): ExceptionCandidate | null {
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const staleMinutes = (simulatedNow.getTime() - last.recordedAt.getTime()) / 60000;
  if (staleMinutes <= CONTACT_LOSS_THRESHOLD_MINUTES) return null;
  return { type: "CONTACT_LOSS", magnitude: `no position update in ${formatDuration(staleMinutes)}` };
}

export function detectExceptions(
  load: Load,
  positions: PositionUpdate[],
  simulatedNow: Date
): ExceptionCandidate[] {
  const sorted = sortByTime(positions);
  const candidates = [
    detectDwell(load, sorted),
    detectRouteDeviation(load, sorted),
    detectEtaSlip(load, sorted),
    detectContactLoss(sorted, simulatedNow),
  ];
  return candidates.filter((c): c is ExceptionCandidate => c !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/exceptions.test.ts`
Expected: `7 passed`. **If any test fails because a hand-estimated threshold doesn't match the test fixture's actual geometry, adjust the relevant constant** (`ETA_SLIP_THRESHOLD_MINUTES`, `DWELL_THRESHOLD_MINUTES`, etc.) and re-run — these fixtures were constructed to be unambiguous, but haversine/point-to-segment arithmetic by hand is error-prone; trust the test run over the plan's prose.

- [ ] **Step 5: Commit**

```bash
git add lib/exceptions.ts tests/lib/exceptions.test.ts
git commit -m "feat: add deterministic exception detection"
```

---

## Task 4: `lib/exceptions-llm.ts` — the exception agent and the hard-coded priority override

**Files:**
- Create: `lib/exceptions-llm.ts`
- Test: `tests/lib/exceptions-llm.test.ts`

**Interfaces:**
- Consumes: `callLLM`, `LLMFallbackError` from `lib/llm.ts`; `ExceptionCandidate`, `DWELL_BREAKDOWN_THRESHOLD_MINUTES` from `lib/exceptions.ts`; `Load` from `@/app/generated/prisma/client`.
- Produces: `ExceptionAgentSchema` (Zod), `ExceptionAgentResult` (type), `getExceptionRead(load: Load, candidate: ExceptionCandidate): Promise<{ result: ExceptionAgentResult; degraded: boolean }>`. The pure override/fallback logic (`applyHardOverride`, `degradedResult`) is unit-tested directly; `getExceptionRead` itself calls the network and is verified manually in Task 7.

- [ ] **Step 1: Write the failing tests for the pure override logic**

```ts
// tests/lib/exceptions-llm.test.ts
import { describe, it, expect } from "vitest";
import { applyHardOverride, degradedResult } from "../../lib/exceptions-llm";
import type { ExceptionCandidate } from "../../lib/exceptions";
import type { ExceptionAgentResult } from "../../lib/exceptions-llm";

const dwellCandidate: ExceptionCandidate = {
  type: "DWELL",
  magnitude: "stopped 2h30m, 12mi off planned route",
  durationMinutes: 150,
};

const shortDwellCandidate: ExceptionCandidate = {
  type: "DWELL",
  magnitude: "stopped 45m, 2mi off planned route",
  durationMinutes: 45,
};

const etaSlipCandidate: ExceptionCandidate = {
  type: "ETA_SLIP",
  magnitude: "projected 3h late",
};

function llmResult(overrides: Partial<ExceptionAgentResult>): ExceptionAgentResult {
  return {
    likelyCause: "Traffic delay",
    priority: "LOW",
    draftDriverMessage: "Checking in on your ETA",
    draftCustomerMessage: null,
    confidence: "medium",
    ...overrides,
  };
}

describe("applyHardOverride", () => {
  it("forces HIGH priority for a long dwell, even if the model said LOW", () => {
    const result = applyHardOverride(dwellCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("HIGH");
  });

  it("does not override a short dwell below the breakdown threshold", () => {
    const result = applyHardOverride(shortDwellCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("LOW");
  });

  it("does not override a non-DWELL exception type regardless of duration", () => {
    const result = applyHardOverride(etaSlipCandidate, llmResult({ priority: "LOW" }));
    expect(result.priority).toBe("LOW");
  });

  it("preserves the model's other fields when overriding priority", () => {
    const result = applyHardOverride(dwellCandidate, llmResult({ likelyCause: "Possible breakdown", priority: "MED" }));
    expect(result.priority).toBe("HIGH");
    expect(result.likelyCause).toBe("Possible breakdown");
  });
});

describe("degradedResult", () => {
  it("still forces HIGH for a long dwell even without a real LLM call", () => {
    const result = degradedResult(dwellCandidate);
    expect(result.priority).toBe("HIGH");
    expect(result.confidence).toBe("low");
  });

  it("defaults to MED for a non-breakdown-pattern exception with no LLM available", () => {
    const result = degradedResult(etaSlipCandidate);
    expect(result.priority).toBe("MED");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/exceptions-llm.test.ts`
Expected: FAIL — `Cannot find module '../../lib/exceptions-llm'`.

- [ ] **Step 3: Implement `lib/exceptions-llm.ts`**

```ts
import { z } from "zod";
import { callLLM, LLMFallbackError } from "./llm";
import { DWELL_BREAKDOWN_THRESHOLD_MINUTES, type ExceptionCandidate } from "./exceptions";
import type { Load } from "@/app/generated/prisma/client";

export const ExceptionAgentSchema = z.object({
  likelyCause: z.string(),
  priority: z.enum(["HIGH", "MED", "LOW"]),
  draftDriverMessage: z.string().nullable(),
  draftCustomerMessage: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ExceptionAgentResult = z.infer<typeof ExceptionAgentSchema>;

const SYSTEM_PROMPT = `A truck has triggered an exception during transit. Explain the
likely cause in plain language for a dispatcher, and draft a short
check-in message to the driver (or an ETA update to the customer, if
it's a delay). If you cannot determine a likely cause with reasonable
confidence, say so honestly rather than guessing — return "unexplained
deviation" as the cause. Return ONLY valid JSON:
{ "likelyCause": string, "priority": "HIGH"|"MED"|"LOW",
  "draftDriverMessage": string|null, "draftCustomerMessage": string|null,
  "confidence": "high"|"medium"|"low" }`;

// Spec §6 hard rule: a prolonged off-route dwell is a possible-breakdown
// signature. Priority is forced to HIGH here regardless of what the model
// said, on both the success path (this function) and the fallback path
// (degradedResult below) -- a down API must not weaken this.
export function applyHardOverride(
  candidate: ExceptionCandidate,
  raw: ExceptionAgentResult
): ExceptionAgentResult {
  const isBreakdownDwell =
    candidate.type === "DWELL" &&
    candidate.durationMinutes !== undefined &&
    candidate.durationMinutes >= DWELL_BREAKDOWN_THRESHOLD_MINUTES;
  if (isBreakdownDwell) {
    return { ...raw, priority: "HIGH" };
  }
  return raw;
}

export function degradedResult(candidate: ExceptionCandidate): ExceptionAgentResult {
  const isBreakdownDwell =
    candidate.type === "DWELL" &&
    candidate.durationMinutes !== undefined &&
    candidate.durationMinutes >= DWELL_BREAKDOWN_THRESHOLD_MINUTES;
  return {
    likelyCause: "Unable to determine — AI analysis unavailable, deterministic detection only.",
    priority: isBreakdownDwell ? "HIGH" : "MED",
    draftDriverMessage: null,
    draftCustomerMessage: null,
    confidence: "low",
  };
}

export async function getExceptionRead(
  load: Load,
  candidate: ExceptionCandidate
): Promise<{ result: ExceptionAgentResult; degraded: boolean }> {
  const userPrompt = `Exception type: ${candidate.type}. Load: ${load.origin} to ${load.destination}.
Detected: ${candidate.magnitude}.
Planned ETA: ${load.plannedETA ? load.plannedETA.toISOString() : "not set"}. Current time: ${new Date().toISOString()}.`;

  try {
    const raw = await callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt }, ExceptionAgentSchema);
    return { result: applyHardOverride(candidate, raw), degraded: false };
  } catch (err) {
    if (err instanceof LLMFallbackError) {
      return { result: degradedResult(candidate), degraded: true };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/exceptions-llm.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/exceptions-llm.ts tests/lib/exceptions-llm.test.ts
git commit -m "feat: add exception agent LLM call with hard-coded breakdown-priority override"
```

---

## Task 5: Exceptions feed UI — page, `AdvanceSimulationButton`, `ExceptionActions`

**Files:**
- Create: `app/alerts/page.tsx`
- Create: `app/alerts/AdvanceSimulationButton.tsx`
- Create: `app/alerts/ExceptionActions.tsx`

**Interfaces:**
- Consumes: `prisma`, `AiBadge` (`components/AiBadge.tsx`), `advanceSimulation`/`approveException`/`dismissException` from Task 6's `app/alerts/actions.ts` (not created until the next task — same deliberate ordering used in the sibling branches' Review-screen tasks: expect exactly one `Cannot find module './actions'` tsc error after this task, resolved by Task 6).
- Produces: the `/alerts` route (already linked from `app/layout.tsx`'s nav).

- [ ] **Step 1: Implement the page**

```tsx
// app/alerts/page.tsx
import { prisma } from "@/lib/prisma";
import { AiBadge } from "@/components/AiBadge";
import { AdvanceSimulationButton } from "./AdvanceSimulationButton";
import { ExceptionActions } from "./ExceptionActions";

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MED: 1, LOW: 2 };

export default async function AlertsPage() {
  const exceptions = await prisma.exception.findMany({
    where: { status: "OPEN" },
    include: { load: true },
  });
  const sorted = [...exceptions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exceptions</h1>
        <AdvanceSimulationButton />
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          All loads on track.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((exception) => (
            <div
              key={exception.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {exception.type.replace("_", " ")} — {exception.load.origin} → {exception.load.destination}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    exception.priority === "HIGH"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : exception.priority === "MED"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {exception.priority}
                </span>
              </div>
              {exception.aiRead && (
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <AiBadge />
                  <span>{exception.aiRead}</span>
                </p>
              )}
              <ExceptionActions exceptionId={exception.id} draftMessage={exception.draftMessage} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `AdvanceSimulationButton`**

```tsx
// app/alerts/AdvanceSimulationButton.tsx
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
```

- [ ] **Step 3: Implement `ExceptionActions`**

```tsx
// app/alerts/ExceptionActions.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveException, dismissException } from "./actions";

export function ExceptionActions({
  exceptionId,
  draftMessage,
}: {
  exceptionId: string;
  draftMessage: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedMessage, setEditedMessage] = useState(draftMessage ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove() {
    startTransition(async () => {
      await approveException(exceptionId, isEditing ? editedMessage : undefined);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {draftMessage !== null && !isEditing && (
        <p className="text-sm text-zinc-500">Draft: &quot;{editedMessage}&quot;</p>
      )}
      {isEditing && (
        <textarea
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Approve
        </button>
        <button
          onClick={() => setIsEditing((v) => !v)}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {isEditing ? "Cancel edit" : "Edit"}
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await dismissException(exceptionId);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify — expect exactly the one anticipated error**

Run: `npx tsc --noEmit`
Expected: exactly one error class, `Cannot find module './actions'` (from both `AdvanceSimulationButton.tsx` and `ExceptionActions.tsx`), nothing else. Proceed to Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/AdvanceSimulationButton.tsx app/alerts/ExceptionActions.tsx
git commit -m "feat: add exceptions feed UI"
```

---

## Task 6: `app/alerts/actions.ts` — the simulation trigger and approve/dismiss actions

**Files:**
- Create: `app/alerts/actions.ts`

**Interfaces:**
- Consumes: `prisma`, `detectExceptions` (`lib/exceptions.ts`), `getExceptionRead` (`lib/exceptions-llm.ts`).
- Produces: `advanceSimulation(): Promise<void>`, `approveException(id: string, editedMessage?: string): Promise<void>`, `dismissException(id: string): Promise<void>` — resolves Task 5's dangling `./actions` import.

- [ ] **Step 1: Implement the actions**

```ts
// app/alerts/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { detectExceptions } from "@/lib/exceptions";
import { getExceptionRead } from "@/lib/exceptions-llm";

export async function advanceSimulation() {
  const inTransitLoads = await prisma.load.findMany({
    where: { status: "IN_TRANSIT" },
    include: { positionUpdates: true },
  });

  const maxRecorded = await prisma.positionUpdate.aggregate({ _max: { recordedAt: true } });
  const simulatedNow = maxRecorded._max.recordedAt ?? new Date();

  for (const load of inTransitLoads) {
    const candidates = detectExceptions(load, load.positionUpdates, simulatedNow);

    for (const candidate of candidates) {
      const existing = await prisma.exception.findFirst({
        where: { loadId: load.id, type: candidate.type, status: { in: ["OPEN", "APPROVED"] } },
      });
      if (existing) continue;

      const { result } = await getExceptionRead(load, candidate);

      await prisma.exception.create({
        data: {
          loadId: load.id,
          type: candidate.type,
          priority: result.priority,
          aiRead: result.likelyCause,
          draftMessage: result.draftDriverMessage ?? result.draftCustomerMessage ?? null,
          status: "OPEN",
        },
      });
    }
  }

  revalidatePath("/alerts");
}

export async function approveException(id: string, editedMessage?: string) {
  await prisma.exception.update({
    where: { id },
    data: {
      status: "APPROVED",
      ...(editedMessage !== undefined ? { draftMessage: editedMessage } : {}),
    },
  });
  revalidatePath("/alerts");
}

export async function dismissException(id: string) {
  await prisma.exception.update({ where: { id }, data: { status: "DISMISSED" } });
  revalidatePath("/alerts");
}
```

- [ ] **Step 2: Verify it compiles cleanly now**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/alerts/actions.ts
git commit -m "feat: add simulation-advance and exception approve/dismiss actions"
```

---

## Task 7: Manual verification pass

No further code changes — this is the gate before the final acceptance pass across all three feature branches.

- [ ] **Step 1: Run the full automated suite**

```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: all pass. **If `npm test` reveals a threshold mismatch against the real seed data (see the "note on thresholds" at the top of this plan), fix the constant in `lib/exceptions.ts` and re-run before proceeding** — don't treat this plan's threshold guesses as final.

- [ ] **Step 2: Empty state**

`npm run dev`, open `/alerts` before ever clicking the button.
Expected: "All loads on track" (no `Exception` rows exist yet in a freshly-seeded DB).

- [ ] **Step 3: Advance simulation — verify each seeded trace's outcome**

Click "Advance simulation time" (or `curl -X POST` isn't available for a Server Action — instead exercise it via the page's button in a real browser, or, since this environment has no browser, call `advanceSimulation` indirectly by hitting `/alerts` after temporarily wiring a test route, OR — simplest — just inspect the resulting DB state after triggering the action through whatever mechanism is available in this environment; if curl-testing a Server Action isn't feasible, use `sqlite3` before/after comparisons around a manual trigger).

Expected outcomes, verified via `sqlite3 dev.db "select loadId, type, priority, aiRead from Exception;"`:
- The clean NY→Cleveland load: **no** exception row.
- The Chicago→Indianapolis load: an `ETA_SLIP` exception, with a real LLM-drafted `aiRead`/`draftMessage` (check the console log for the actual Gemini call and response).
- The Atlanta→Charlotte load: a `DWELL` exception with `priority = HIGH` **even if the console log shows the LLM itself returned a different priority** — this proves `applyHardOverride` actually fires, not just that the prompt asks nicely. Also check `aiRead` for this one: per spec §6/§8 demo item 6, an honest model should say something like "unexplained deviation" rather than inventing a specific cause, since this trace was deliberately built with no explanatory signal — report what it actually says.

- [ ] **Step 4: Idempotency**

Click "Advance simulation time" a second time.
Expected: no duplicate `Exception` rows are created (`sqlite3 dev.db "select loadId, type, count(*) from Exception group by loadId, type having count(*) > 1;"` returns nothing), and no new LLM calls happen for loads that already have an OPEN exception of that type (check the console log has no new `[LLM call]` lines for those loads on the second click).

- [ ] **Step 5: Approve, edit, dismiss**

Approve one exception (with an edited message), dismiss another.
Expected: the approved one's `status` becomes `APPROVED` and, if edited, `draftMessage` reflects the edit; the dismissed one's `status` becomes `DISMISSED`; both disappear from the `/alerts` feed (which only shows `OPEN`); the feed's empty state reappears once nothing `OPEN` remains, or narrows to just the still-open ones.

- [ ] **Step 6: Deterministic fallback mode**

Blank `GEMINI_API_KEY`, restart, delete the existing Exception rows for one load (to force fresh detection+LLM-attempt), click "Advance simulation time" again.
Expected: the `DWELL` load (if still eligible) still gets `priority = HIGH` — proving the hard override holds even without a live LLM call — and every load gets a graceful degraded `aiRead` ("Unable to determine — AI analysis unavailable...") rather than a crash. Restore the real key and restart afterward.

- [ ] **Step 7: Report and stop**

If everything passes with no code changes needed beyond any threshold tuning from Step 1, Task Group 3 is done. Report back.
