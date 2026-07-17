-- CreateTable
CREATE TABLE "PositionUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PositionUpdate_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
