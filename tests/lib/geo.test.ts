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
