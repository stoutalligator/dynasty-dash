"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { startTransition, useId, useMemo, useState, ViewTransition } from "react";
import { vtName } from "@/components/page-suspense";
import { PlayerAvatar } from "@/components/avatar";
import { PlayerDrawer } from "@/components/player-drawer";
import { Sparkbars } from "@/components/waivers/waiver-explorer";
import { InjuryBadge, InfoTip, PosBadge, ValueTrend } from "@/components/ui";
import type { PlayerView } from "@/lib/analysis/types";
import type { RosterSlot } from "@/lib/league/models";
import { fmtAge, fmtInt, fmtPts } from "@/lib/format";

type SortKey = "slot" | "name" | "pos" | "age" | "ppg" | "total" | "snap" | "proj" | "value" | "impact";
const SLOT_ORDER: Record<RosterSlot, number> = { starter: 0, bench: 1, taxi: 2, reserve: 3 };
const SLOT_LABEL: Record<RosterSlot, string> = { starter: "Starters", bench: "Bench", taxi: "Taxi squad", reserve: "Reserve / IR" };
const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3 };
/** Long lists (the league-wide player pool) render in pages so the page stays light. */
const PAGE = 100;

const TAG_CLASS: Record<string, string> = {
  Core: "text-accent ring-accent/30",
  Starter: "text-ink-2 ring-line-strong",
  Expendable: "text-brand-amber ring-brand-amber/30",
  "Age risk": "text-serious ring-serious/30",
  "Taxi stash": "text-brand-purple ring-brand-purple/30",
  "Low sample": "text-ink-3 ring-line",
  Unavailable: "text-critical ring-critical/30",
  "Free agent": "text-good ring-good/30",
  "Rising role": "text-good ring-good/30",
  "Hot streak": "text-brand-amber ring-brand-amber/30",
  "Shrinking role": "text-critical ring-critical/30",
  "Cold streak": "text-ink-2 ring-line-strong",
};

const TAG_PRIORITY = ["Unavailable", "Core", "Rising role", "Shrinking role", "Age risk", "Hot streak", "Cold streak", "Expendable", "Taxi stash", "Free agent", "Low sample", "Starter"];

/** At most `max` tags, most important first; the full list is in the title. */
export function TagList({ tags, max = 2 }: { tags: string[]; max?: number }) {
  const sorted = [...tags].sort((a, b) => TAG_PRIORITY.indexOf(a) - TAG_PRIORITY.indexOf(b));
  return (
    <span className="flex flex-wrap gap-1" title={tags.join(", ")}>
      {sorted.slice(0, max).map((t) => (
        <span key={t} className={clsx("rounded px-1 py-px text-[10px] font-medium ring-1 ring-inset", TAG_CLASS[t] ?? "text-ink-3 ring-line")}>
          {t}
        </span>
      ))}
    </span>
  );
}

export function RosterTable({
  players,
  startingSlots,
  valueLabel,
  showTeam,
  teamNames,
  initialSort = "slot",
}: {
  players: PlayerView[];
  startingSlots?: string[];
  valueLabel: string;
  showTeam?: boolean;
  teamNames?: Record<number, string>;
  initialSort?: SortKey;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: initialSort, dir: initialSort === "slot" ? 1 : -1 });
  const [pos, setPos] = useState<string>("ALL");
  const [slot, setSlot] = useState<string>("ALL");
  const [selected, setSelected] = useState<PlayerView | null>(null);
  const nameButton = (p: PlayerView, cls: string) => (
    <button type="button" onClick={() => setSelected(p)} className={clsx("truncate text-left hover:underline", cls, p.mapped ? "text-ink" : "text-warning")}>
      {p.name}
    </button>
  );

  const rows = useMemo(() => {
    const slotIndex = (p: PlayerView) => (p.starterSlot && startingSlots ? startingSlots.indexOf(p.starterSlot) : 99);
    const filtered = players.filter((p) => (pos === "ALL" || p.position === pos) && (slot === "ALL" || p.slot === slot));
    const val = (p: PlayerView): number | string => {
      switch (sort.key) {
        case "slot": return (SLOT_ORDER[p.slot ?? "bench"] ?? 9) * 1000 + (p.slot === "starter" ? slotIndex(p) : (POS_ORDER[p.position ?? ""] ?? 9) * 100 - (p.value ?? 0) / 1000);
        case "name": return p.name;
        case "pos": return (POS_ORDER[p.position ?? ""] ?? 9) * 1e6 - (p.value ?? 0);
        case "age": return p.age ?? 99;
        case "ppg": return p.prod?.ppg ?? -1;
        case "total": return p.prod?.total ?? -1;
        case "snap": return p.prod?.snapShareLast3 ?? -1;
        case "proj": return p.projWeek ?? -1;
        case "value": return p.value ?? -1;
        case "impact": return p.lineupImpact;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
    });
  }, [players, pos, slot, sort, startingSlots]);

  const header = (key: SortKey, label: string, cls?: string, defaultDir: 1 | -1 = -1, tip?: string) => (
    <th scope="col" className={clsx("px-2 py-2 font-medium", cls)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : defaultDir }))}
          className={clsx("inline-flex items-center gap-0.5 hover:text-ink", sort.key === key && "text-ink")}
        >
          {label}
          {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
        </button>
        {tip && <InfoTip text={tip} />}
      </span>
    </th>
  );

  const grouped = sort.key === "slot" && slot === "ALL";
  const slotCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const p of rows) m.set(p.slot, (m.get(p.slot) ?? 0) + 1);
    return m;
  }, [rows]);
  // Reset paging whenever the filters or sort change (no effect needed: derived from a key).
  const pageKey = `${pos}|${slot}|${sort.key}|${sort.dir}|${players.length}`;
  const [paging, setPaging] = useState({ key: pageKey, n: PAGE });
  const shownCount = paging.key === pageKey ? paging.n : PAGE;
  const visible = rows.length > shownCount ? rows.slice(0, shownCount) : rows;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Segmented value={pos} onChange={setPos} options={["ALL", "QB", "RB", "WR", "TE"]} label="Position" />
        <Segmented value={slot} onChange={setSlot} options={["ALL", "starter", "bench", "taxi", "reserve"]} labels={{ ALL: "All", starter: "Starters", bench: "Bench", taxi: "Taxi", reserve: "IR" }} label="Roster slot" />
        <label className="md:hidden">
          <span className="sr-only">Sort by</span>
          <select
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSort({ key, dir: key === "slot" || key === "name" || key === "age" ? 1 : -1 });
            }}
            className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1 text-xs text-ink"
          >
            <option value="slot">Sort: roster slot</option>
            <option value="value">Sort: value</option>
            <option value="ppg">Sort: PPG</option>
            <option value="impact">Sort: lineup impact</option>
            <option value="proj">Sort: projection</option>
            <option value="age">Sort: age</option>
            <option value="name">Sort: name</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-ink-3">{rows.length} players</span>
      </div>

      {/* Phones: compact player rows instead of a wide table. */}
      <ul className="border-t border-line md:hidden">
        {visible.map((p, i) => (
          <li key={p.id}>
            {grouped && (i === 0 || visible[i - 1].slot !== p.slot) && (
              <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {SLOT_LABEL[p.slot ?? "bench"]} ({slotCounts.get(p.slot) ?? 0})
              </div>
            )}
            <div className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5">
              <PlayerAvatar id={p.id} name={p.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <PosBadge pos={p.position} />
                  {nameButton(p, "text-sm font-medium")}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-ink-3">
                  <span>
                    {p.starterSlot ? `${p.starterSlot.replace("SUPER_FLEX", "SF")} · ` : ""}
                    {p.nflTeam ?? "FA"} · <span className={p.ageRisk ? "text-serious" : undefined}>{fmtAge(p.age)}y</span>
                    {showTeam && p.rosterId != null && teamNames && ` · ${teamNames[p.rosterId]}`}
                  </span>
                  <InjuryBadge injury={p.injury} compact />
                  <TagList tags={p.tags.filter((t) => t !== "Starter" && t !== "Unavailable" && t !== "Free agent")} max={1} />
                </div>
              </div>
              <div className="tnum shrink-0 text-right">
                <div className="text-sm text-ink">{p.value != null ? fmtInt(p.value) : "—"}</div>
                <div><ValueTrend trend={p.valueTrend30} value={p.value} className="mt-0.5" /></div>
                <div className="text-[11px] text-ink-3">
                  {p.prod && p.prod.activeWeeks > 0 ? `${fmtPts(p.prod.ppg)} ppg` : "no pts"}
                  {p.onBye ? " · bye" : p.projWeek != null && p.projWeek > 0 && ` · proj ${fmtPts(p.projWeek)}`}
                  {p.lineupImpact > 0 && ` · −${fmtPts(p.lineupImpact)}`}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="tnum w-full min-w-[900px] text-sm">
          <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
            <tr>
              {header("slot", "Slot", "pl-4 w-16", 1)}
              {header("name", "Player", "", 1)}
              {header("pos", "Pos", "w-12", 1)}
              {header("age", "Age", "w-14 text-right", 1)}
              <th scope="col" className="w-24 px-2 py-2 font-medium">Status</th>
              <th scope="col" className="hidden w-20 px-2 py-2 text-left font-medium xl:table-cell">Last 8</th>
              {header("ppg", "PPG", "w-20 text-right", -1, "Average fantasy points (league scoring) in completed weeks where the player scored. Source: Sleeper matchups.")}
              {header("total", "Total", "w-16 text-right")}
              {header("snap", "Snap", "w-16 text-right", -1, "Offensive snap share over the last three games played (NFL stats).")}
              {header("proj", "Proj", "w-16 text-right", -1, "Sleeper's projection for this week, scored with your league settings. A third-party projection, not ours.")}
              <th scope="col" className="w-20 px-2 py-2 text-right font-medium">Started</th>
              {header("value", "Value", "w-24 text-right", -1, `Dynasty value from ${valueLabel}.`)}
              {header("impact", "Impact", "w-20 pr-4 text-right", -1, "Adjusted PPG the best possible lineup loses without this player. 0 = not in the best lineup.")}
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const groupRow = grouped && (i === 0 || visible[i - 1].slot !== p.slot) ? (
                <tr key={`g-${p.slot}`} className="bg-surface-2/50">
                  <td colSpan={13} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {SLOT_LABEL[p.slot ?? "bench"]} ({slotCounts.get(p.slot) ?? 0})
                  </td>
                </tr>
              ) : null;
              return [
                groupRow,
                <tr key={p.id} className="border-b border-line/60 transition-colors hover:bg-surface-2/60">
                  <td className="py-2 pl-4 pr-2 text-[11px] font-medium text-ink-3">{p.starterSlot?.replace("SUPER_FLEX", "SF") ?? (p.slot === "bench" ? "BN" : p.slot === "taxi" ? "TAXI" : p.slot === "reserve" ? "IR" : "FA")}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar id={p.id} name={p.name} />
                      <div className="min-w-0">
                        {nameButton(p, "block max-w-full font-medium")}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-3">
                          <span>
                            {p.nflTeam ?? "FA"}
                            {p.yearsExp != null && ` · ${p.yearsExp === 0 ? "Rookie" : `${p.yearsExp} yr exp`}`}
                            {showTeam && p.rosterId != null && teamNames && ` · ${teamNames[p.rosterId]}`}
                          </span>
                          <TagList tags={p.tags.filter((t) => t !== "Starter" && t !== "Unavailable" && t !== "Free agent")} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2"><PosBadge pos={p.position} /></td>
                  <td className={clsx("px-2 py-2 text-right", p.ageRisk ? "text-serious" : "text-ink-2")}>{fmtAge(p.age)}</td>
                  <td className="px-2 py-2"><InjuryBadge injury={p.injury} compact /></td>
                  <td className="hidden px-2 py-2 xl:table-cell">{p.prod && p.prod.weekly.length > 0 ? <Sparkbars weekly={p.prod.weekly.slice(-8)} /> : null}</td>
                  <td className="px-2 py-2 text-right text-ink">
                    {p.prod && p.prod.activeWeeks > 0 ? fmtPts(p.prod.ppg) : <span className="text-ink-3">—</span>}
                    {p.prod && p.prod.activeWeeks > 0 && <span className="ml-1 text-[10px] text-ink-3">{p.prod.activeWeeks}g</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-ink-2">{p.prod ? fmtPts(p.prod.total) : "—"}</td>
                  <td className="px-2 py-2 text-right text-ink-2">{p.prod?.snapShareLast3 != null ? `${Math.round(p.prod.snapShareLast3 * 100)}%` : "—"}</td>
                  <td className="px-2 py-2 text-right text-ink-2">
                    {p.onBye ? <span className="rounded bg-surface-3 px-1 py-px text-[10px] font-semibold tracking-wide text-ink-3">BYE</span> : p.projWeek != null ? fmtPts(p.projWeek) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-ink-3">{p.prod ? `${p.prod.weeksStarted}/${p.prod.weeksStarted + p.prod.weeksBenched}` : "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <span className="text-ink">{p.value != null ? fmtInt(p.value) : "—"}</span>
                    {p.positionRank != null && <span className="ml-1 text-[10px] text-ink-3">{p.position}{p.positionRank}</span>}
                    <div><ValueTrend trend={p.valueTrend30} value={p.value} className="mt-0.5" /></div>
                  </td>
                  <td className={clsx("py-2 pl-2 pr-4 text-right", p.lineupImpact > 0 ? "text-ink" : "text-ink-3")}>{p.lineupImpact > 0 ? fmtPts(p.lineupImpact) : "0"}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {rows.length > visible.length && (
        <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-3 text-xs text-ink-3">
          <span className="tnum">
            Showing {visible.length} of {rows.length}
          </span>
          <button
            type="button"
            onClick={() => setPaging({ key: pageKey, n: shownCount + PAGE })}
            className="rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 transition hover:border-accent/40 hover:text-ink"
          >
            Show {Math.min(PAGE, rows.length - visible.length)} more
          </button>
        </div>
      )}
      <PlayerDrawer player={selected} teamName={selected?.rosterId != null ? teamNames?.[selected.rosterId] : null} onClose={() => setSelected(null)} />
    </div>
  );
}

export function Segmented({
  value,
  onChange,
  options,
  labels,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  label: string;
}) {
  const id = vtName("seg", useId());
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2/50 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => startTransition(() => onChange(o))}
          className={clsx("relative rounded-md px-2.5 py-1 text-xs transition-colors", value === o ? "font-medium text-ink" : "text-ink-3 hover:text-ink-2")}
        >
          {value === o && (
            <ViewTransition name={id} share="morph" default="none">
              <span aria-hidden className="absolute inset-0 rounded-md bg-surface-3 shadow-sm ring-1 ring-inset ring-line-strong/60" />
            </ViewTransition>
          )}
          <span className="relative">{labels?.[o] ?? (o === "ALL" ? "All" : o)}</span>
        </button>
      ))}
    </div>
  );
}
