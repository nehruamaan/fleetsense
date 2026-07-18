import { Sparkles } from "lucide-react";

export function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
      <Sparkles className="h-3 w-3" aria-hidden /> AI
    </span>
  );
}
