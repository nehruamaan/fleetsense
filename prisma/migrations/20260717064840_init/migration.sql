-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentLat" REAL NOT NULL,
    "currentLng" REAL NOT NULL,
    "hosRemainingMinutes" INTEGER NOT NULL,
    "hos14hrWindowMinutes" INTEGER NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "homeTimePref" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "recentLaneHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Load" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "pickupWindow" TEXT NOT NULL,
    "deliveryWindow" TEXT NOT NULL,
    "equipmentRequired" TEXT NOT NULL,
    "plannedRouteGeoJSON" TEXT,
    "plannedETA" DATETIME,
    "revenue" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "customerEmail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "rankedDrivers" TEXT NOT NULL,
    "recommendedDriverId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "tieFlag" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT NOT NULL,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "wasRecommended" BOOLEAN NOT NULL,
    "overrideReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "extractedFields" TEXT,
    "confidencePerField" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reconciliation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" TEXT NOT NULL,
    "aiRead" TEXT,
    "draftMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exception_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_loadId_key" ON "Invoice"("loadId");
