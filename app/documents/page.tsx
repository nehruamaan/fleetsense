import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DocumentsPage() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Documents In</h1>
      <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {documents.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <p className="font-medium">
              Driver submitted a {doc.type} for Load #{doc.loadId.slice(-6)}
            </p>
            <StatusBadge domain="document" status={doc.status} />
          </Link>
        ))}
        {documents.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No documents submitted yet.</p>
        )}
      </div>
    </div>
  );
}
