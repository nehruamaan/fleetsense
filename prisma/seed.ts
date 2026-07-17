import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_IMAGE_DIR = path.join(process.cwd(), "public", "seed");

// Renders a plain-text "document" as an SVG so we have real, viewable image
// files without needing network access or binary image tooling.
function writeDocSvg(filename: string, title: string, lines: string[], garbled = false) {
  const rows = lines
    .map((line, i) => {
      const y = 70 + i * 26;
      const rotate = garbled ? (i % 2 === 0 ? -6 : 5) : 0;
      const jitterX = garbled ? (i * 37) % 40 : 0;
      return `<text x="${40 + jitterX}" y="${y}" font-size="16" font-family="monospace" transform="rotate(${rotate} ${40 + jitterX} ${y})" fill="#222">${line}</text>`;
    })
    .join("\n    ");

  const noiseOverlay = garbled
    ? Array.from({ length: 40 })
        .map(() => {
          const x = Math.round(Math.random() * 560);
          const y = Math.round(Math.random() * 380);
          return `<rect x="${x}" y="${y}" width="${6 + Math.random() * 10}" height="${
            2 + Math.random() * 4
          }" fill="#999" opacity="0.5"/>`;
        })
        .join("\n    ")
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">
    <rect width="600" height="420" fill="#fdfdfb" stroke="#ccc"/>
    <text x="40" y="36" font-size="20" font-family="sans-serif" font-weight="bold" fill="#111">${title}</text>
    ${rows}
    ${noiseOverlay}
  </svg>`;

  fs.mkdirSync(SEED_IMAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SEED_IMAGE_DIR, filename), svg, "utf-8");
  return `/seed/${filename}`;
}

async function main() {
  console.log("Clearing existing data...");
  await prisma.exception.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.positionUpdate.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.load.deleteMany();
  await prisma.driver.deleteMany();

  console.log("Seeding drivers...");
  const driverDefs = [
    {
      name: "Alice Rivera",
      currentLat: 40.7128,
      currentLng: -74.006,
      hosRemainingMinutes: 620,
      hos14hrWindowMinutes: 780,
      equipmentType: "Dry Van",
      homeTimePref: "Home by Friday night",
      notes:
        "Prefers to avoid NYC-metro drop-offs when possible — reports heavy traffic stress on prior lanes through the Lincoln Tunnel corridor.",
      recentLaneHistory: ["NJ-PA", "PA-OH", "NY-NJ"],
    },
    {
      name: "Ben Okafor",
      currentLat: 39.9526,
      currentLng: -75.1652,
      hosRemainingMinutes: 95,
      hos14hrWindowMinutes: 140,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["PA-VA", "VA-NC"],
    },
    {
      name: "Carla Nguyen",
      currentLat: 41.8781,
      currentLng: -87.6298,
      hosRemainingMinutes: 410,
      hos14hrWindowMinutes: 600,
      equipmentType: "Reefer",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["IL-IN", "IN-OH"],
    },
    {
      name: "Derek Holt",
      currentLat: 33.749,
      currentLng: -84.388,
      hosRemainingMinutes: 540,
      hos14hrWindowMinutes: 700,
      equipmentType: "Flatbed",
      homeTimePref: "Prefers to be home most Fridays for family dinner",
      notes:
        "Avoids I-95 corridor through the Carolinas when an alternate route is reasonable — was in a minor collision there last year and has asked dispatch not to route him through it unless necessary.",
      recentLaneHistory: ["GA-SC", "GA-FL"],
    },
    {
      name: "Elena Petrova",
      currentLat: 32.7767,
      currentLng: -96.797,
      hosRemainingMinutes: 60,
      hos14hrWindowMinutes: 90,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["TX-OK", "TX-LA"],
    },
    {
      name: "Frank Osei",
      currentLat: 29.7604,
      currentLng: -95.3698,
      hosRemainingMinutes: 350,
      hos14hrWindowMinutes: 500,
      equipmentType: "Reefer",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["TX-LA", "LA-MS"],
    },
    {
      name: "Grace Kim",
      currentLat: 34.0522,
      currentLng: -118.2437,
      hosRemainingMinutes: 600,
      hos14hrWindowMinutes: 750,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["CA-AZ", "CA-NV"],
    },
    {
      name: "Hassan Ali",
      currentLat: 47.6062,
      currentLng: -122.3321,
      hosRemainingMinutes: 480,
      hos14hrWindowMinutes: 630,
      equipmentType: "Reefer",
      homeTimePref: "Short-haul only, home most nights",
      notes:
        "Strong track record with reefer/temperature-sensitive freight. Has told dispatch he'd rather stay on short-haul lanes near Seattle than take long-haul assignments right now.",
      recentLaneHistory: ["WA-OR", "WA-ID"],
    },
    {
      name: "Isla Chen",
      currentLat: 36.1699,
      currentLng: -115.1398,
      hosRemainingMinutes: 40,
      hos14hrWindowMinutes: 55,
      equipmentType: "Flatbed",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["NV-CA", "NV-AZ"],
    },
    {
      name: "Jamal Brooks",
      currentLat: 39.7684,
      currentLng: -86.1581,
      hosRemainingMinutes: 660,
      hos14hrWindowMinutes: 840,
      equipmentType: "Dry Van",
      homeTimePref: null,
      notes: "",
      recentLaneHistory: ["IN-IL", "IN-KY"],
    },
  ];

  const drivers = [];
  for (const d of driverDefs) {
    drivers.push(
      await prisma.driver.create({
        data: {
          name: d.name,
          currentLat: d.currentLat,
          currentLng: d.currentLng,
          hosRemainingMinutes: d.hosRemainingMinutes,
          hos14hrWindowMinutes: d.hos14hrWindowMinutes,
          equipmentType: d.equipmentType,
          homeTimePref: d.homeTimePref,
          notes: d.notes,
          recentLaneHistory: JSON.stringify(d.recentLaneHistory),
        },
      })
    );
  }
  const [alice, ben, carla, derek, elena, frank, grace, hassan, isla, jamal] = drivers;

  console.log("Seeding loads...");
  const now = new Date("2026-07-17T12:00:00Z");
  const hours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  const loadDefs = [
    {
      origin: "Newark, NJ",
      destination: "Columbus, OH",
      pickupWindow: "2026-07-18 06:00-08:00",
      deliveryWindow: "2026-07-18 18:00-20:00",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-74.17, 40.74], [-82.99, 39.96]] }),
      plannedETA: hours(30),
      revenue: 1450,
      status: "NEW" as const,
      customerEmail: "ops@midwest-distro.example",
    },
    {
      origin: "Chicago, IL",
      destination: "Memphis, TN",
      pickupWindow: "2026-07-18 07:00-09:00",
      deliveryWindow: "2026-07-19 08:00-10:00",
      equipmentRequired: "Reefer",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-87.63, 41.88], [-90.05, 35.15]] }),
      plannedETA: hours(28),
      revenue: 1780,
      status: "NEW" as const,
      customerEmail: "logistics@coldchain-foods.example",
    },
    {
      origin: "Atlanta, GA",
      destination: "Jacksonville, FL",
      pickupWindow: "2026-07-18 05:00-07:00",
      deliveryWindow: "2026-07-18 14:00-16:00",
      equipmentRequired: "Flatbed",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-84.39, 33.75], [-81.66, 30.33]] }),
      plannedETA: hours(20),
      revenue: 1120,
      status: "NEW" as const,
      customerEmail: "dispatch@southeast-steel.example",
    },
    {
      // Edge case: equipment type no driver in the fleet has -> zero eligible drivers.
      origin: "Denver, CO",
      destination: "Salt Lake City, UT",
      pickupWindow: "2026-07-19 06:00-08:00",
      deliveryWindow: "2026-07-19 20:00-22:00",
      equipmentRequired: "Step Deck",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-104.99, 39.74], [-111.89, 40.76]] }),
      plannedETA: hours(35),
      revenue: 2050,
      status: "NEW" as const,
      customerEmail: "planning@rockymtn-equip.example",
    },
    {
      // Edge case: no planned route / ETA yet -> "not_monitored" case.
      origin: "Portland, OR",
      destination: "Boise, ID",
      pickupWindow: "2026-07-20 06:00-08:00",
      deliveryWindow: "2026-07-20 18:00-20:00",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: null,
      plannedETA: null,
      revenue: 980,
      status: "NEW" as const,
      customerEmail: "shipping@pnw-wholesale.example",
    },
    {
      origin: "Philadelphia, PA",
      destination: "Richmond, VA",
      pickupWindow: "2026-07-17 14:00-16:00",
      deliveryWindow: "2026-07-17 22:00-23:59",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-75.16, 39.95], [-77.44, 37.54]] }),
      plannedETA: hours(10),
      revenue: 890,
      status: "ASSIGNED" as const,
      customerEmail: "ap@midatlantic-goods.example",
      assignDriver: ben,
    },
    {
      origin: "Houston, TX",
      destination: "New Orleans, LA",
      pickupWindow: "2026-07-17 09:00-11:00",
      deliveryWindow: "2026-07-17 18:00-20:00",
      equipmentRequired: "Reefer",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-95.37, 29.76], [-90.07, 29.95]] }),
      plannedETA: hours(8),
      revenue: 1340,
      status: "ASSIGNED" as const,
      customerEmail: "receiving@gulfcoast-seafood.example",
      assignDriver: frank,
    },
    {
      // In transit, clean: steady progress on-route, no anomalies.
      origin: "New York, NY",
      destination: "Cleveland, OH",
      pickupWindow: "2026-07-16 06:00-08:00",
      deliveryWindow: "2026-07-16 20:00-22:00",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-74.0, 40.71], [-81.69, 41.5]] }),
      plannedETA: hours(-2),
      revenue: 1560,
      status: "IN_TRANSIT" as const,
      customerEmail: "ops@lakefront-industrial.example",
      assignDriver: jamal,
      trace: "clean" as const,
    },
    {
      // In transit, ETA slip: running behind planned ETA.
      origin: "Chicago, IL",
      destination: "Indianapolis, IN",
      pickupWindow: "2026-07-16 10:00-12:00",
      deliveryWindow: "2026-07-16 18:00-19:00",
      equipmentRequired: "Reefer",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-87.63, 41.88], [-86.16, 39.77]] }),
      plannedETA: hours(-4),
      revenue: 990,
      status: "IN_TRANSIT" as const,
      customerEmail: "warehouse@heartland-grocers.example",
      assignDriver: carla,
      trace: "eta_slip" as const,
    },
    {
      // In transit, ambiguous dwell/deviation: stationary off-route, unclear cause.
      origin: "Atlanta, GA",
      destination: "Charlotte, NC",
      pickupWindow: "2026-07-16 07:00-09:00",
      deliveryWindow: "2026-07-16 15:00-17:00",
      equipmentRequired: "Flatbed",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-84.39, 33.75], [-80.84, 35.23]] }),
      plannedETA: hours(-6),
      revenue: 1230,
      status: "IN_TRANSIT" as const,
      customerEmail: "yard@carolina-building-supply.example",
      assignDriver: derek,
      trace: "ambiguous_dwell" as const,
    },
    {
      // Delivered, with a legitimate accessorial (detention) that has a supporting doc on file.
      origin: "Seattle, WA",
      destination: "Portland, OR",
      pickupWindow: "2026-07-15 08:00-10:00",
      deliveryWindow: "2026-07-15 14:00-16:00",
      equipmentRequired: "Reefer",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-122.33, 47.61], [-122.68, 45.52]] }),
      plannedETA: hours(-30),
      revenue: 760,
      status: "DELIVERED" as const,
      customerEmail: "ap@pnw-produce.example",
      assignDriver: hassan,
      docs: "detention_supported" as const,
    },
    {
      // Invoiced, with a mismatch that has NO supporting document -> should not be auto-added.
      origin: "Dallas, TX",
      destination: "Tulsa, OK",
      pickupWindow: "2026-07-14 08:00-10:00",
      deliveryWindow: "2026-07-14 14:00-16:00",
      equipmentRequired: "Dry Van",
      plannedRouteGeoJSON: JSON.stringify({ type: "LineString", coordinates: [[-96.8, 32.78], [-95.99, 36.15]] }),
      plannedETA: hours(-48),
      revenue: 640,
      status: "INVOICED" as const,
      customerEmail: "billing@sooner-retail.example",
      assignDriver: elena,
      docs: "mismatch_unsupported" as const,
    },
  ];

  const loads = [];
  for (const l of loadDefs) {
    loads.push(
      await prisma.load.create({
        data: {
          origin: l.origin,
          destination: l.destination,
          pickupWindow: l.pickupWindow,
          deliveryWindow: l.deliveryWindow,
          equipmentRequired: l.equipmentRequired,
          plannedRouteGeoJSON: l.plannedRouteGeoJSON,
          plannedETA: l.plannedETA,
          revenue: l.revenue,
          status: l.status,
          customerEmail: l.customerEmail,
        },
      })
    );
  }

  console.log("Seeding assignments...");
  for (let i = 0; i < loadDefs.length; i++) {
    const def = loadDefs[i];
    if (!("assignDriver" in def) || !def.assignDriver) continue;
    await prisma.assignment.create({
      data: {
        loadId: loads[i].id,
        driverId: def.assignDriver.id,
        wasRecommended: true,
        status: def.status === "ASSIGNED" ? "PENDING" : "ACCEPTED",
      },
    });
  }

  console.log("Seeding position traces...");
  const traceLoadIndex = { clean: 7, eta_slip: 8, ambiguous_dwell: 9 };

  // Clean: steady progress toward destination, on schedule.
  {
    const loadId = loads[traceLoadIndex.clean].id;
    const points: [number, number][] = [
      [-74.0, 40.71],
      [-76.5, 41.05],
      [-78.9, 41.3],
      [-81.69, 41.5],
    ];
    for (let i = 0; i < points.length; i++) {
      await prisma.positionUpdate.create({
        data: {
          loadId,
          lat: points[i][1],
          lng: points[i][0],
          recordedAt: new Date(now.getTime() - (points.length - i) * 60 * 60 * 1000),
        },
      });
    }
  }

  // ETA slip: progress is real but slower than planned pace -> projected arrival misses plannedETA.
  {
    const loadId = loads[traceLoadIndex.eta_slip].id;
    const points: [number, number][] = [
      [-87.63, 41.88],
      [-87.3, 41.1],
      [-87.0, 40.3],
      [-86.7, 39.9],
    ];
    for (let i = 0; i < points.length; i++) {
      await prisma.positionUpdate.create({
        data: {
          loadId,
          lat: points[i][1],
          lng: points[i][0],
          recordedAt: new Date(now.getTime() - (points.length - i) * 2 * 60 * 60 * 1000),
        },
      });
    }
  }

  // Ambiguous dwell: stationary off-route for hours, no explanatory signal.
  {
    const loadId = loads[traceLoadIndex.ambiguous_dwell].id;
    const stationary: [number, number] = [-82.9, 34.5]; // off the Atlanta->Charlotte line
    for (let i = 0; i < 5; i++) {
      await prisma.positionUpdate.create({
        data: {
          loadId,
          lat: stationary[1],
          lng: stationary[0],
          recordedAt: new Date(now.getTime() - (5 - i) * 45 * 60 * 1000),
        },
      });
    }
  }

  console.log("Seeding documents...");

  // Clean rate-con / POD pair with no discrepancy.
  {
    const load = loads[5]; // Philadelphia -> Richmond, ASSIGNED to Ben
    const url = writeDocSvg("ratecon-clean-1.svg", "RATE CONFIRMATION", [
      `Load #${load.id.slice(-6)}`,
      "Broker: MidAtlantic Freight Brokers",
      "Origin: Philadelphia, PA",
      "Destination: Richmond, VA",
      "Rate: $890.00",
      "Terms: Net 30",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: ben.id,
        type: "RATE_CON",
        imageUrl: url,
        extractedFields: JSON.stringify({ broker: "MidAtlantic Freight Brokers", amount: 890, loadReference: load.id }),
        confidencePerField: JSON.stringify({ amount: "high", broker: "high" }),
        status: "EXTRACTED",
      },
    });
    const podUrl = writeDocSvg("pod-clean-1.svg", "PROOF OF DELIVERY", [
      `Load #${load.id.slice(-6)}`,
      "Delivered to: Richmond, VA receiving dock",
      "Signed by: J. Marsh",
      "Amount due: $890.00",
      "No exceptions noted",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: ben.id,
        type: "POD",
        imageUrl: podUrl,
        extractedFields: JSON.stringify({ amount: 890, loadReference: load.id, accessorialNotes: null }),
        confidencePerField: JSON.stringify({ amount: "high" }),
        status: "EXTRACTED",
      },
    });
  }

  // Detention charge WITH supporting accessorial doc on file -> legitimate, addable.
  {
    const load = loads[10]; // Seattle -> Portland, DELIVERED, Hassan
    const rateUrl = writeDocSvg("ratecon-clean-2.svg", "RATE CONFIRMATION", [
      `Load #${load.id.slice(-6)}`,
      "Broker: PNW Produce Logistics",
      "Origin: Seattle, WA",
      "Destination: Portland, OR",
      "Rate: $760.00",
      "Terms: Net 15",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: hassan.id,
        type: "RATE_CON",
        imageUrl: rateUrl,
        extractedFields: JSON.stringify({ broker: "PNW Produce Logistics", amount: 760, loadReference: load.id }),
        confidencePerField: JSON.stringify({ amount: "high", broker: "high" }),
        status: "EXTRACTED",
      },
    });
    const podUrl = writeDocSvg("pod-detention-1.svg", "PROOF OF DELIVERY", [
      `Load #${load.id.slice(-6)}`,
      "Delivered to: Portland, OR receiving dock",
      "Detention: 3.0 hrs wait at receiver",
      "Invoice amount: $910.00",
      "Signed by: R. Alvarez",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: hassan.id,
        type: "POD",
        imageUrl: podUrl,
        extractedFields: JSON.stringify({
          amount: 910,
          loadReference: load.id,
          accessorialNotes: "Detention 3.0 hrs at receiver",
        }),
        confidencePerField: JSON.stringify({ amount: "high", accessorialNotes: "medium" }),
        status: "EXTRACTED",
      },
    });
    const accessorialUrl = writeDocSvg("accessorial-detention-1.svg", "ACCESSORIAL - DETENTION", [
      `Load #${load.id.slice(-6)}`,
      "Type: Detention",
      "Duration: 3.0 hours",
      "Rate: $50/hr after 2 free hours",
      "Charge: $150.00",
      "Approved on-site by: R. Alvarez",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: hassan.id,
        type: "ACCESSORIAL",
        imageUrl: accessorialUrl,
        extractedFields: JSON.stringify({ amount: 150, loadReference: load.id, accessorialNotes: "Detention 3.0 hrs" }),
        confidencePerField: JSON.stringify({ amount: "high" }),
        status: "EXTRACTED",
      },
    });
  }

  // Mismatch with NO supporting document -> should surface as "needs doc from driver", not auto-add.
  {
    const load = loads[11]; // Dallas -> Tulsa, INVOICED, Elena
    const rateUrl = writeDocSvg("ratecon-clean-3.svg", "RATE CONFIRMATION", [
      `Load #${load.id.slice(-6)}`,
      "Broker: Sooner Retail Distribution",
      "Origin: Dallas, TX",
      "Destination: Tulsa, OK",
      "Rate: $640.00",
      "Terms: Net 30",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: elena.id,
        type: "RATE_CON",
        imageUrl: rateUrl,
        extractedFields: JSON.stringify({ broker: "Sooner Retail Distribution", amount: 640, loadReference: load.id }),
        confidencePerField: JSON.stringify({ amount: "high", broker: "high" }),
        status: "EXTRACTED",
      },
    });
    const podUrl = writeDocSvg("pod-mismatch-1.svg", "PROOF OF DELIVERY", [
      `Load #${load.id.slice(-6)}`,
      "Delivered to: Tulsa, OK receiving dock",
      "Invoice amount: $715.00",
      "Signed by: T. Whitfield",
      "No accessorial notes on file",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: elena.id,
        type: "POD",
        imageUrl: podUrl,
        extractedFields: JSON.stringify({ amount: 715, loadReference: load.id, accessorialNotes: null }),
        confidencePerField: JSON.stringify({ amount: "high", accessorialNotes: "low" }),
        status: "EXTRACTED",
      },
    });
  }

  // Deliberately blurry/unreadable BOL -> failed extraction.
  {
    const load = loads[6]; // Houston -> New Orleans, ASSIGNED, Frank
    const bolUrl = writeDocSvg(
      "bol-blurry-1.svg",
      "BILL OF LADING",
      [`Load #${load.id.slice(-6)}`, "Shipper: [illegible]", "Consignee: [illegible]", "Weight: [illegible]", "Pieces: [illegible]"],
      true
    );
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: frank.id,
        type: "BOL",
        imageUrl: bolUrl,
        extractedFields: null,
        confidencePerField: JSON.stringify({ shipper: "low", consignee: "low", weight: "low" }),
        status: "FAILED",
      },
    });
  }

  // Fuel receipt for variety.
  {
    const load = loads[7]; // NY -> Cleveland, IN_TRANSIT, Jamal
    const fuelUrl = writeDocSvg("fuel-receipt-1.svg", "FUEL RECEIPT", [
      "Pilot Flying J - Breezewood, PA",
      "Diesel: 92.4 gal",
      "Price/gal: $3.79",
      "Total: $350.20",
    ]);
    await prisma.document.create({
      data: {
        loadId: load.id,
        driverId: jamal.id,
        type: "FUEL",
        imageUrl: fuelUrl,
        extractedFields: JSON.stringify({ amount: 350.2, date: "2026-07-16" }),
        confidencePerField: JSON.stringify({ amount: "high" }),
        status: "EXTRACTED",
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
