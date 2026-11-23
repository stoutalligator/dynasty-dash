"use client";

import clsx from "clsx";
import { ArrowLeftRight, Info, Shield, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { startTransition, useId, useState, ViewTransition } from "react";
import { vtName } from "@/components/page-suspense";
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
  const underline = vtName("rec", useId());
  return (
    <div>
      <div role="tablist" aria-label="Strategy scenario" className="flex gap-1 border-b border-line px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => startTransition(() => setTab(t.key))}
            className={clsx("relative -mb-px px-2.5 py-2.5 text-xs font-medium transition-colors", tab === t.key ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {t.label}
            {t.key === recommended && <span className="ml-1 text-[10px] text-accent">●</span>}
            {tab === t.key && (
              <ViewTransition name={underline} share="morph" default="none">
                <span aria-hidden className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-2" />
              </ViewTransition>
            )}
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
                <li key={`${r.title}-${i}`} className="animate-pop-in flex gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2/70" style={{ animationDelay: `${i * 35}ms` }}>
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{r.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{r.detail}</div>
                    {r.action && (
                      <Link href={r.action.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                        {r.action.label} →
                      </Link>
                    )}
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
