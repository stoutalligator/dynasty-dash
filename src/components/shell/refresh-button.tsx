"use client";

import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { refreshData } from "@/app/actions";

export function RefreshButton({ scope = "league", label = "Refresh", className }: { scope?: "league" | "all"; label?: string; className?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await refreshData(scope);
            setMsg(r.ok ? (r.data.warnings ? `Synced with ${r.data.warnings} warning(s)` : "Synced") : `Refresh failed: ${r.error}`);
          })
        }
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-2 transition hover:border-accent/40 hover:text-ink disabled:opacity-60",
          className,
        )}
      >
        <RefreshCw aria-hidden className={clsx("size-3.5", pending && "animate-spin")} />
        {pending ? "Syncing…" : label}
      </button>
      <span aria-live="polite" className="text-xs text-ink-3">
        {msg}
      </span>
    </div>
  );
}
