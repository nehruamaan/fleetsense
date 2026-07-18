"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveException, dismissException } from "./actions";
import { useToast } from "@/components/toast/ToastProvider";

export function ExceptionActions({
  exceptionId,
  draftMessage,
}: {
  exceptionId: string;
  draftMessage: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedMessage, setEditedMessage] = useState(draftMessage ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveException(exceptionId, isEditing ? editedMessage : undefined);
        showToast("Exception approved.");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to approve exception.", "error");
      }
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      try {
        await dismissException(exceptionId);
        showToast("Exception dismissed.");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to dismiss exception.", "error");
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {draftMessage !== null && !isEditing && (
        <p className="text-sm text-zinc-500">Draft: &quot;{editedMessage}&quot;</p>
      )}
      {isEditing && (
        <textarea
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Approve
        </button>
        <button
          onClick={() => setIsEditing((v) => !v)}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {isEditing ? "Cancel edit" : "Edit"}
        </button>
        <button
          onClick={handleDismiss}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
