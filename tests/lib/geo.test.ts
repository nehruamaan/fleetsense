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
