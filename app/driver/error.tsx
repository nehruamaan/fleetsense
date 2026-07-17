"use client";

export default function DriverUploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
      <p className="text-sm text-red-800 dark:text-red-200">{error.message || "Something went wrong submitting this document."}</p>
      <button
        onClick={reset}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Try again
      </button>
    </div>
  );
}
