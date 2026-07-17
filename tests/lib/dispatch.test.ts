import { describe, it, expect } from "vitest";
import { filterEligibleDrivers, scoreDrivers, topCandidates } from "../../lib/dispatch";
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
