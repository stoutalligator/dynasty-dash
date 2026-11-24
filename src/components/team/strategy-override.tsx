"use client";

import { useState, useTransition } from "react";
import { setStrategyOverride } from "@/app/actions";
import type { Strategy } from "@/lib/analysis/types";

export function StrategyOverride({ rosterId, inferred, override, showLabel = true }: { rosterId: number; inferred: Strategy; override: Strategy | null; showLabel?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const labels: Record<Strategy, string> = { contender: "Contender", retool: "Retool", rebuild: "Rebuilder" };
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
      <span className={showLabel ? undefined : "sr-only"}>Strategy</span>
      <select
        value={override ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await setStrategyOverride(rosterId, e.target.value || null);
            setError(r.ok ? null : r.error);
          })
        }
        className="rounded-md border border-line-strong bg-surface-2 px-2 py-1 text-xs text-ink disabled:opacity-60"
      >
        <option value="">Auto · {labels[inferred]}</option>
        {(Object.keys(labels) as Strategy[]).map((s) => (
          <option key={s} value={s}>
            {labels[s]} (set by you)
          </option>
        ))}
      </select>
      {error && <span className="text-critical">{error}</span>}
    </label>
  );
}
