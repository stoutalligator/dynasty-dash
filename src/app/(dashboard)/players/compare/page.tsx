import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { PlayerAvatar } from "@/components/avatar";
import { CompareChart } from "@/components/charts";
import { ComparePicker } from "@/components/compare-picker";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardHeader, PageTitle, PosBadge } from "@/components/ui";
import type { PlayerView } from "@/lib/analysis/types";
import { fmtAge, fmtInt, fmtPts, fmtSignedInt } from "@/lib/format";
import { findPlayer, getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Compare players" };

type Row = { label: string; get: (p: PlayerView) => number | null; fmt: (v: number | null) => string; better: "high" | "low" | null };

const ROWS: Row[] = [
  { label: "PPG", get: (p) => (p.prod?.activeWeeks ? p.prod.ppg : null), fmt: (v) => fmtPts(v), better: "high" },
  { label: "Last 3 PPG", get: (p) => p.prod?.last3Ppg ?? null, fmt: (v) => fmtPts(v), better: "high" },
  { label: "Games", get: (p) => p.prod?.activeWeeks ?? null, fmt: (v) => (v == null ? "—" : String(v)), better: null },
  { label: "Snap share (last 3)", get: (p) => p.prod?.snapShareLast3 ?? null, fmt: (v) => (v == null ? "—" : `${Math.round(v * 100)}%`), better: "high" },
  { label: "Opportunities / game", get: (p) => p.prod?.oppLast3 ?? null, fmt: (v) => fmtPts(v), better: "high" },
  { label: "Proj this week", get: (p) => (p.onBye ? null : p.projWeek), fmt: (v) => fmtPts(v), better: "high" },
  { label: "Proj rest of season", get: (p) => p.projRos, fmt: (v) => fmtPts(v, 0), better: "high" },
  { label: "Dynasty value", get: (p) => p.value, fmt: (v) => (v == null ? "—" : fmtInt(v)), better: "high" },
  { label: "Value, last 30 days", get: (p) => p.valueTrend30, fmt: (v) => (v == null ? "—" : fmtSignedInt(v)), better: "high" },
  { label: "Age", get: (p) => p.age, fmt: (v) => fmtAge(v), better: "low" },
];

async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const [{ ids }, { model }] = await Promise.all([searchParams, getLeague()]);
  const players = [...new Set((ids ?? "").split(",").filter((x) => /^\d+$/.test(x)))]
    .slice(0, 3)
    .map((id) => findPlayer(model, id))
    .filter((p): p is PlayerView => !!p);
  const teamName = (rid: number | null) => (rid == null ? "Free agent" : (model.teams.find((t) => t.team.rosterId === rid)?.team.teamName ?? "—"));
  const lastWeek = model.league.lastScoredWeek ?? 0;
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  return (
    <>
      <PageTitle title="Compare players" subtitle="Up to three players side by side: production, usage, projections and value" />
      <div className="mb-5">
        <ComparePicker selected={players.map((p) => ({ id: p.id, name: p.name, position: p.position }))} />
      </div>
      {players.length === 0 ? (
        <Card>
          <p className="px-5 py-10 text-center text-sm text-ink-3">Search for a player above, or open any player and choose Compare.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th className="w-44" />
                    {players.map((p) => (
                      <th key={p.id} className="px-4 pt-5 pb-3 text-left align-bottom font-normal">
                        <Link href={`/players/${p.id}`} className="group flex items-center gap-2.5">
                          <PlayerAvatar id={p.id} name={p.name} size={40} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5"><PosBadge pos={p.position} /><span className="truncate font-semibold text-ink group-hover:underline">{p.name}</span></span>
                            <span className="block truncate text-xs text-ink-3">{p.nflTeam ?? "FA"} · {teamName(p.rosterId)}</span>
                          </span>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => {
                    const vals = players.map(r.get);
                    const known = vals.filter((v): v is number => v != null);
                    const best = r.better && known.length > 1 ? (r.better === "high" ? Math.max(...known) : Math.min(...known)) : null;
                    return (
                      <tr key={r.label} className="border-t border-line/60">
                        <th scope="row" className="px-5 py-2.5 text-left text-xs font-medium text-ink-3" title={r.label === "Opportunities / game" ? "Last 3 games: targets + carries (QBs: pass attempts + carries)" : undefined}>{r.label}</th>
                        {vals.map((v, i) => (
                          <td key={players[i].id} className={clsx("px-4 py-2.5", best != null && v === best ? "font-semibold text-ink" : "text-ink-2")}>
                            {best != null && v === best && <span aria-label="best" className="mr-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-accent" />}
                            {r.fmt(v)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {lastWeek > 0 && (
            <Card>
              <CardHeader title="Weekly points" subtitle="Scored with your league's settings · gaps are byes or games missed" />
              <div className="px-2 pb-4">
                <CompareChart
                  weeks={weeks}
                  series={players.map((p) => {
                    const byWeek = new Map((p.prod?.weekly ?? []).filter((w) => w.played).map((w) => [w.week, w.points]));
                    return { name: p.name, points: weeks.map((w) => byWeek.get(w) ?? null) };
                  })}
                />
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <Compare searchParams={searchParams} />
    </PageSuspense>
  );
}
