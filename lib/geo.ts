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
