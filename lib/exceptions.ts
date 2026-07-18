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
  try {
    const parsed = JSON.parse(load.plannedRouteGeoJSON) as { coordinates: [number, number][] };
    const [startLng, startLat] = parsed.coordinates[0];
    const [endLng, endLat] = parsed.coordinates[parsed.coordinates.length - 1];
    if (
      typeof startLat !== "number" ||
      typeof startLng !== "number" ||
      typeof endLat !== "number" ||
      typeof endLng !== "number"
    ) {
      return null;
    }
    return { start: { lat: startLat, lng: startLng }, end: { lat: endLat, lng: endLng } };
  } catch {
    return null; // malformed route JSON -- treat as not_monitored rather than crashing all detectors for this load
  }
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

  let destination;
  try {
    destination = lookupCityCoords(load.destination);
  } catch {
    return null; // unknown destination -- skip ETA projection rather than crashing all detectors for this load
  }
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
