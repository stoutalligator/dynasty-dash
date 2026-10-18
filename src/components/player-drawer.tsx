"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { PlayerAvatar } from "@/components/avatar";
import { InjuryBadge, PosBadge } from "@/components/ui";
import type { PlayerView } from "@/lib/analysis/types";
import { fmtAge, fmtInt, fmtPts } from "@/lib/format";

/** Slide-over with a player's game log, usage, projections and value. */
export function PlayerDrawer({ player: p, teamName, onClose }: { player: PlayerView | null; teamName?: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!p) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p, onClose]);
  if (!p) return null;
  const pr = p.prod;
  const maxPts = Math.max(1, ...(pr?.weekly.map((w) => w.points) ?? [1]));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${p.name} details`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <PlayerAvatar id={p.id} name={p.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PosBadge pos={p.position} />
              <h2 className="truncate text-lg font-semibold text-ink">{p.name}</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">
              {p.nflTeam ?? "Free agent (NFL)"} · age {fmtAge(p.age)} · {p.yearsExp === 0 ? "rookie" : `${p.yearsExp ?? "?"} yr exp`}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              {p.rosterId != null ? `Rostered${teamName ? ` by ${teamName}` : ""}${p.slot ? ` · ${p.slot}` : ""}` : "Available in your league"}
            </p>
            <div className="mt-1.5"><InjuryBadge injury={p.injury} /></div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close player details" className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <dl className="tnum grid grid-cols-3 gap-2 p-4 text-center text-[11px]">
          {[
            ["PPG", pr && pr.activeWeeks ? fmtPts(pr.ppg) : "—", pr ? `${pr.activeWeeks} games` : ""],
            ["Last 3", fmtPts(pr?.last3Ppg ?? null), "PPG"],
            ["Snap %", pr?.snapShareLast3 != null ? `${Math.round(pr.snapShareLast3 * 100)}` : "—", "last 3"],
            ["Proj this wk", fmtPts(p.projWeek), "Sleeper"],
            ["Proj ROS", fmtPts(p.projRos, 0), "through finals"],
            ["Value", p.value != null ? fmtInt(p.value) : "—", p.positionRank ? `${p.position}${p.positionRank}` : p.valueSource === "internal-estimate" ? "estimate" : ""],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-lg bg-surface-2/70 px-2 py-2">
              <dt className="text-ink-3">{label}</dt>
              <dd className="text-[15px] font-semibold text-ink">{value}</dd>
              {sub && <dd className="text-[10px] text-ink-3">{sub}</dd>}
            </div>
          ))}
        </dl>

        {p.rosterId != null && (
          <p className="px-4 text-xs text-ink-2">
            Lineup impact: <span className="text-ink">{p.lineupImpact > 0 ? `${fmtPts(p.lineupImpact)} adj. PPG` : "not in the best lineup"}</span>
            {p.tags.length > 0 && <> · {p.tags.join(", ")}</>}
          </p>
        )}
        {p.trendingAdds ? <p className="px-4 pt-1 text-xs text-ink-2">{fmtInt(p.trendingAdds)} Sleeper adds in the last 48h</p> : null}

        <div className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Game log (league scoring)</h3>
          {pr && pr.weekly.length ? (
            <table className="tnum w-full text-sm">
              <thead className="text-left text-[11px] text-ink-3">
                <tr>
                  <th className="py-1 font-medium">Wk</th>
                  <th className="py-1 font-medium">Points</th>
                  <th className="py-1 text-right font-medium">Snap</th>
                  <th className="py-1 text-right font-medium">{p.position === "QB" ? "Att" : "Opp"}</th>
                  <th className="py-1 text-right font-medium">Fantasy</th>
                </tr>
              </thead>
              <tbody>
                {pr.weekly.map((w) => (
                  <tr key={w.week} className="border-t border-line/60">
                    <td className="py-1.5 text-ink-3">{w.week}</td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-brand-blue/15" aria-hidden>
                          <div className="h-1.5 rounded-full bg-brand-blue" style={{ width: `${w.played ? Math.max(3, (Math.max(0, w.points) / maxPts) * 100) : 0}%` }} />
                        </div>
                        <span className={clsx(w.played ? "text-ink" : "text-ink-3")}>{w.played ? fmtPts(w.points) : "DNP / bye"}</span>
                      </div>
                    </td>
                    <td className="py-1.5 text-right text-ink-2">{w.snapShare != null ? `${Math.round(w.snapShare * 100)}%` : "—"}</td>
                    <td className="py-1.5 text-right text-ink-2">{w.opportunities ?? "—"}</td>
                    <td className="py-1.5 text-right text-[11px] text-ink-3">{w.started == null ? "FA" : w.started ? "Started" : "Bench"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-3">No NFL production this season.</p>
          )}
          <p className="mt-3 text-[11px] text-ink-3">Stats: Sleeper weekly NFL stats scored with your league settings. Projections: Sleeper. Value: {p.valueSource === "third-party" ? "third-party dynasty value" : "internal estimate"}.</p>
        </div>
      </aside>
    </div>
  );
}
