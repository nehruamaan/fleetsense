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
