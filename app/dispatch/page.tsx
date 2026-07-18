import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DispatchPage() {
  const loads = await prisma.load.findMany({
    where: { status: { in: ["NEW", "ASSIGNED"] } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Loads awaiting dispatch</h1>
      <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {loads.map((load) => (
          <Link
            key={load.id}
            href={`/dispatch/${load.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium">
                {load.origin} → {load.destination}
              </p>
              <p className="text-sm text-zinc-500">
                {load.equipmentRequired} · Pickup {load.pickupWindow}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">${load.revenue.toFixed(0)}</p>
              <StatusBadge domain="load" status={load.status} />
            </div>
          </Link>
        ))}
        {loads.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No loads awaiting dispatch.</p>
        )}
      </div>
    </div>
  );
}
