"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { generateDigest } from "@/app/actions";

export function DigestActions() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await generateDigest();
      setMsg(r.ok ? "Digest rebuilt" : `Failed: ${r.error}`);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run()} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-60">
        <RefreshCw aria-hidden className="size-4" /> Build now
      </button>
      <span aria-live="polite" className="text-xs text-ink-3">{pending ? "Working…" : msg}</span>
    </div>
  );
}
