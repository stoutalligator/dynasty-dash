"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { PlayerAvatar } from "@/components/avatar";
import { Segmented } from "@/components/team/roster-table";
import { InjuryBadge, PosBadge } from "@/components/ui";
import type { PickupTier, WaiverCandidate } from "@/lib/analysis/waivers";
import { fmtInt, fmtPts } from "@/lib/format";

const TIER_CLASS: Record<PickupTier, string> = {
  "Strong add": "text-accent bg-accent/10 ring-accent/30",
  "Worth a look": "text-brand-blue bg-brand-blue/10 ring-brand-blue/30",
  Stash: "text-brand-purple bg-brand-purple/10 ring-brand-purple/30",
  Monitor: "text-ink-3 bg-surface-3 ring-line",
};

export function TierBadge({ tier }: { tier: PickupTier }) {
  return <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", TIER_CLASS[tier])}>{tier}</span>;
}

/** Weekly points as tiny bars; empty bars are weeks without a game. */
function Sparkbars({ weekly }: { weekly: { week: number; points: number; played: boolean }[] }) {
  const max = Math.max(1, ...weekly.map((w) => w.points));
  return (
    <span className="flex h-6 items-end gap-[2px]" role="img" aria-label={`Weekly points: ${weekly.map((w) => `wk ${w.week} ${w.played ? w.points.toFixed(1) : "no game"}`).join(", ")}`}>
      {weekly.map((w) => (
        <span key={w.week} title={`Wk ${w.week}: ${w.played ? w.points.toFixed(1) : "no game"}`} className={clsx("w-1.5 rounded-t-sm", w.played ? "bg-brand-blue" : "bg-line")} style={{ height: `${w.played ? Math.max(8, (w.points / max) * 100) : 8}%` }} />
      ))}
    </span>
  );
}

type SortKey = "score" | "recent" | "proj" | "snap" | "trending" | "value";

export function WaiverExplorer({ candidates, projectionWeek }: { candidates: WaiverCandidate[]; projectionWeek: number | null }) {
  const [pos, setPos] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [fits, setFits] = useState(false);
  const [maxAge, setMaxAge] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  const query = useDeferredValue(q.trim().toLowerCase());

  const rows = useMemo(() => {
    const key = (c: WaiverCandidate) => {
      const p = c.player;
      switch (sort) {
        case "score": return c.score;
        case "recent": return p.prod?.last3Ppg ?? p.prod?.ppg ?? -1;
        case "proj": return p.projWeek ?? -1;
        case "snap": return p.prod?.snapShareLast3 ?? -1;
        case "trending": return p.trendingAdds ?? -1;
        case "value": return p.value ?? -1;
      }
    };
    return candidates
      .filter((c) => (pos === "ALL" || c.player.position === pos) && (tier === "ALL" || c.tier === tier))
      .filter((c) => !fits || c.lineupGain > 0.05 || c.fillsNeed)
      .filter((c) => !maxAge || (c.player.age != null && c.player.age <= Number(maxAge)))
      .filter((c) => !query || `${c.player.name} ${c.player.nflTeam ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => key(b) - key(a));
  }, [candidates, pos, tier, fits, maxAge, sort, query]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <label className="relative">
          <span className="sr-only">Search free agents</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-36 rounded-lg border border-line-strong bg-surface-2 py-1.5 pr-2 pl-8 text-sm text-ink placeholder:text-ink-3" />
        </label>
        <Segmented value={pos} onChange={setPos} options={["ALL", "QB", "RB", "WR", "TE"]} label="Position" />
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier" className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink">
          <option value="ALL">All tiers</option>
          <option>Strong add</option>
          <option>Worth a look</option>
          <option>Stash</option>
          <option>Monitor</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by" className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink">
          <option value="score">Sort: pickup score</option>
          <option value="recent">Sort: recent PPG</option>
          <option value="proj">Sort: projection</option>
          <option value="snap">Sort: snap share</option>
          <option value="trending">Sort: Sleeper adds</option>
          <option value="value">Sort: dynasty value</option>
        </select>
        <Segmented value={maxAge} onChange={setMaxAge} options={["", "24", "27"]} labels={{ "": "Any age", "24": "≤24", "27": "≤27" }} label="Max age" />
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={fits} onChange={(e) => setFits(e.target.checked)} className="accent-[var(--color-accent)]" />
          Fits my roster
        </label>
        <span className="ml-auto text-xs text-ink-3">{rows.length} players</span>
      </div>

      <ul className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
        {rows.slice(0, limit).map((c) => {
          const p = c.player;
          const pr = p.prod;
          return (
            <li key={p.id} className="rounded-xl border border-line bg-surface-2/30 p-3">
              <div className="flex items-start gap-3">
                <PlayerAvatar id={p.id} name={p.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PosBadge pos={p.position} />
                    <span className="truncate font-medium text-ink">{p.name}</span>
                    <InjuryBadge injury={p.injury} compact />
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {p.nflTeam ?? "FA"} · {p.age != null ? `${p.age.toFixed(1)}y` : "age —"} · {p.yearsExp === 0 ? "Rookie" : p.yearsExp != null ? `${p.yearsExp} yr exp` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <TierBadge tier={c.tier} />
                  <span className="tnum text-lg font-semibold text-ink" title="Pickup score (0–100)">{c.score}</span>
                </div>
              </div>

              <div className="tnum mt-3 grid grid-cols-3 gap-2 text-center text-[11px] sm:grid-cols-6">
                <Stat label="PPG" value={pr && pr.activeWeeks ? fmtPts(pr.ppg) : "—"} sub={pr ? `${pr.activeWeeks}g` : undefined} />
                <Stat label="Last 3" value={fmtPts(pr?.last3Ppg ?? null)} />
                <Stat label="Snap %" value={pr?.snapShareLast3 != null ? `${Math.round(pr.snapShareLast3 * 100)}` : "—"} sub={pr?.snapTrend != null && Math.abs(pr.snapTrend) >= 0.05 ? `${pr.snapTrend > 0 ? "▲" : "▼"}${Math.round(Math.abs(pr.snapTrend) * 100)}` : undefined} />
                <Stat label={p.position === "QB" ? "Att/g" : "Opp/g"} value={fmtPts(pr?.oppLast3 ?? null)} />
                <Stat label={projectionWeek ? `Proj W${projectionWeek}` : "Proj"} value={fmtPts(p.projWeek)} />
                <Stat label="Value" value={p.value != null ? fmtInt(p.value) : "—"} />
              </div>

              {pr && pr.weekly.length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-3">
                  <Sparkbars weekly={pr.weekly} /> weekly points
                </div>
              )}

              <ul className="mt-2 space-y-0.5 text-[12px] leading-relaxed text-ink-2">
                {c.reasons.slice(0, 5).map((r) => (
                  <li key={r} className={clsx("flex gap-1.5", r.startsWith("Would start") && "font-medium text-accent")}>
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                    {r}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => setLimit((l) => l + 30)} className="w-full rounded-lg border border-line bg-surface-2 py-2 text-sm text-ink-2 hover:text-ink">
            Show more ({rows.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-surface-2/70 px-1 py-1.5">
      <div className="text-ink-3">{label}</div>
      <div className="text-[13px] font-semibold text-ink">
        {value}
        {sub && <span className="ml-0.5 text-[10px] font-normal text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}
