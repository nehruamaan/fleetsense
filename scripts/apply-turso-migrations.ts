// One-time schema setup for a fresh Turso database.
//
// Prisma's migrate/db-push CLI commands connect using schema.prisma's native
// "sqlite" engine, which only understands local file paths -- it cannot
// target a remote libsql:// URL directly (driver adapters like
// @prisma/adapter-libsql are a Node.js *runtime* concept, not something the
// Prisma CLI's migration engine currently supports for SQLite). So instead
// of `prisma migrate deploy`, this script replays the already-generated
// migration.sql files (prisma/migrations/*/migration.sql) directly against
// the target database via the libsql client -- the same client the app
// itself uses at runtime (lib/prisma.ts).
//
// Usage:
//   DATABASE_URL="libsql://<your-db>.turso.io" DATABASE_AUTH_TOKEN="..." \
//     npx tsx scripts/apply-turso-migrations.ts
//
// Safe to run once against a fresh database. Re-running against a database
// that already has the tables will fail on "table already exists" --
// that's expected, not a bug in this script.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL is a local file path -- this script is for applying migrations to a " +
        "remote Turso database. For local dev, use `npx prisma db push` or `npx prisma migrate dev` instead."
    );
  }

  const client = createClient({ url, authToken });

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // migration folder names are timestamp-prefixed, so lexical sort == chronological order

  for (const folder of migrationFolders) {
    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;

    console.log(`Applying ${folder}...`);
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // Split into individual statements. Prisma's generated migration.sql
    // uses `-- CreateTable` / `-- CreateIndex` comment lines as section markers
    // before the actual SQL statement. Split on `;`, then for each chunk:
    //   1. Strip leading comment lines (lines starting with --)
    //   2. Trim whitespace
    //   3. Drop empty chunks
    const statements = sql
      .split(";")
      .map((s) => {
        // Remove lines that are pure comments, then trim
        const withoutComments = s
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("--"))
          .join("\n")
          .trim();
        return withoutComments;
      })
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await client.execute(statement);
    }
  }

  console.log("All migrations applied.");
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
