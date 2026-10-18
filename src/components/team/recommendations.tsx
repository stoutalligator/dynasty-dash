"use client";

import clsx from "clsx";
import { ArrowLeftRight, Info, Shield, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { Recommendation } from "@/lib/analysis/recommendations";
import type { Strategy } from "@/lib/analysis/types";

const ICON = { upgrade: TrendingUp, sell: TrendingDown, keep: Shield, target: ArrowLeftRight, info: Info };
const TABS: { key: Strategy; label: string; blurb: string }[] = [
  { key: "contender", label: "Contend now", blurb: "Improve the starting lineup, fix weaknesses, and spend expendable future value selectively." },
  { key: "retool", label: "Retool", blurb: "Keep long-term assets, sell surplus or declining pieces, and upgrade without sacrificing flexibility." },
  { key: "rebuild", label: "Rebuild", blurb: "Prioritize youth and draft capital; sell veterans whose production contenders need." },
];

export function Recommendations({ recs, recommended, limit }: { recs: Record<Strategy, Recommendation[]>; recommended: Strategy; limit?: number }) {
  const [tab, setTab] = useState<Strategy>(recommended);
  const active = TABS.find((t) => t.key === tab)!;
  const items = limit ? recs[tab].slice(0, limit) : recs[tab];
  return (
    <div>
      <div role="tablist" aria-label="Strategy scenario" className="flex gap-1 border-b border-line px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx("-mb-px border-b-2 px-2.5 py-2 text-xs font-medium transition", tab === t.key ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            {t.label}
            {t.key === recommended && <span className="ml-1 text-[10px] text-accent">●</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="px-4 py-3">
        <p className="mb-3 text-xs text-ink-3">{active.blurb}</p>
        {items.length ? (
          <ul className="space-y-2.5">
            {items.map((r, i) => {
              const Icon = ICON[r.kind];
              return (
                <li key={`${r.title}-${i}`} className="flex gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{r.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{r.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No data-backed actions for this scenario.</p>
        )}
      </div>
    </div>
  );
}
