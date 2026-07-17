import { prisma } from "@/lib/prisma";
import { submitDocument } from "./actions";

const DOC_TYPES = ["BOL", "POD", "RATE_CON", "ACCESSORIAL", "FUEL"] as const;

export default async function DriverPage() {
  const loads = await prisma.load.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Submit a document</h1>
      <p className="text-sm text-zinc-500">Stand-in for a driver&apos;s phone-camera upload.</p>
      <form
        action={submitDocument}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div>
          <label className="block text-sm font-medium">Load</label>
          <select
            name="loadId"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {loads.map((load) => (
              <option key={load.id} value={load.id}>
                {load.origin} → {load.destination} ({load.status})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Document type</label>
          <select
            name="type"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {DOC_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Photo</label>
          <input type="file" name="file" accept="image/*" required className="mt-1 w-full text-sm" />
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Submit
        </button>
      </form>
    </div>
  );
}
