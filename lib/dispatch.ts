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
