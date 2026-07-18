type StatusDomain = "load" | "document" | "invoice" | "priority";

const STATUS_STYLES: Record<StatusDomain, Record<string, string>> = {
  load: {
    NEW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    ASSIGNED: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    IN_TRANSIT: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    DELIVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    INVOICED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  document: {
    RECEIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    EXTRACTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    FAILED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  invoice: {
    DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    SENT: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  priority: {
    HIGH: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    MED: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

const FALLBACK_STYLE = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

export function StatusBadge({ domain, status }: { domain: StatusDomain; status: string }) {
  const style = STATUS_STYLES[domain][status] ?? FALLBACK_STYLE;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${style}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
