"use client";

import { RefreshCw, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { generateDigest } from "@/app/actions";

export function DigestActions({ canDeliver }: { canDeliver: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (deliver: boolean) =>
    start(async () => {
      setMsg(null);
      const r = await generateDigest(deliver);
      if (!r.ok) return setMsg(`Failed: ${r.error}`);
      const d = r.data.delivered;
      setMsg(deliver ? (d.length ? d.map((x) => `${x.channel}: ${x.ok ? "sent" : `failed (${x.error})`}`).join(" · ") : "Built (no delivery channel configured)") : "Digest rebuilt");
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-60">
        <RefreshCw aria-hidden className="size-4" /> Build now
      </button>
      {canDeliver && (
        <button type="button" disabled={pending} onClick={() => run(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-60">
          <Send aria-hidden className="size-4" /> Build &amp; send
        </button>
      )}
      <span aria-live="polite" className="text-xs text-ink-3">{pending ? "Working…" : msg}</span>
    </div>
  );
}
