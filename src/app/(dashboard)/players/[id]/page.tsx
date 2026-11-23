import { ArrowLeftRight, Columns3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlayerAvatar } from "@/components/avatar";
import { GameLogChart, TrendLine, type GameLogPoint } from "@/components/charts";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardHeader, InjuryBadge, Notice, PosBadge, StatTile, ValueTrend } from "@/components/ui";
import { fmtAge, fmtInt, fmtPts } from "@/lib/format";
import { findPlayer, getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Player" };

async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { model }] = await Promise.all([params, getLeague()]);
  const p = findPlayer(model, id);
  if (!p) {
    return (
      <Notice level="info">
        That player isn&apos;t on a roster in this league or tracked as a free agent. <Link href="/players" className="underline">Browse players</Link>.
      </Notice>
    );
  }
  const owner = p.rosterId != null ? model.teams.find((t) => t.team.rosterId === p.rosterId) : null;
  const pr = p.prod;
  const weeksPlayed = new Map((pr?.weekly ?? []).map((w) => [w.week, w]));
  const lastWeek = model.league.lastScoredWeek ?? 0;
  const log: GameLogPoint[] = Array.from({ length: lastWeek }, (_, i) => {
    const w = weeksPlayed.get(i + 1);
    return { week: `Wk ${i + 1}`, points: w && w.played ? w.points : null, started: w?.started ?? null };
  });
  const snaps = (pr?.weekly ?? []).filter((w) => w.played && w.snapShare != null).map((w) => ({ label: `Wk ${w.week}`, value: w.snapShare! }));

  return (
    <>
      <div className="surface-card hero-surface relative mb-5 overflow-hidden rounded-2xl border border-line">
        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <div className="shrink-0 rounded-full bg-gradient-to-br from-accent to-accent-2 p-[2px]">
            <div className="rounded-full bg-surface p-[2px]">
              <PlayerAvatar id={p.id} name={p.name} size={72} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PosBadge pos={p.position} />
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{p.name}</h1>
              <InjuryBadge injury={p.injury} compact />
            </div>
            <p className="mt-1 text-sm text-ink-3">
              {p.nflTeam ?? "Free agent (NFL)"} · age {fmtAge(p.age)} · {p.yearsExp === 0 ? "rookie" : `${p.yearsExp ?? "?"} yr exp`}
              {p.byeWeek && ` · bye week ${p.byeWeek}`}
            </p>
            <p className="mt-1 text-sm">
              {owner ? (
                <>
                  <span className="text-ink-3">Rostered by </span>
                  <Link href={owner.team.isMine ? "/team" : `/league/${owner.team.rosterId}`} className="font-medium text-ink hover:underline">{owner.team.teamName}</Link>
                  {p.slot && <span className="text-ink-3"> · {p.slot}</span>}
                </>
              ) : (
                <span className="font-medium text-good">Available in your league</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {owner && (
                <Link href={`/trades?asset=${encodeURIComponent(p.assetId)}`} className="btn-primary inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink">
                  <ArrowLeftRight aria-hidden className="size-3.5" /> {owner.team.isMine ? "Shop" : "Find a deal for"} {p.name.split(" ").slice(-1)[0]}
                </Link>
              )}
              <Link href={`/players/compare?ids=${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink">
                <Columns3 aria-hidden className="size-3.5" /> Compare
              </Link>
            </div>
          </div>
          <div className="text-right">
            <div className="label-caps">Value</div>
            <div className="tnum text-3xl font-semibold tracking-tight text-ink">{p.value != null ? fmtInt(p.value) : "—"}</div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-ink-3">
              {p.positionRank != null && <span>{p.position}{p.positionRank}</span>}
              <ValueTrend trend={p.valueTrend30} value={p.value} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="PPG" value={pr && pr.activeWeeks ? fmtPts(pr.ppg) : "—"} sub={pr ? `${pr.activeWeeks} games · ${fmtPts(pr.total)} total` : "No games"} />
        <StatTile label="Last 3" value={fmtPts(pr?.last3Ppg ?? null)} sub="PPG, recent form" />
        <StatTile label="Snap share" value={pr?.snapShareLast3 != null ? `${Math.round(pr.snapShareLast3 * 100)}%` : "—"} sub={pr?.snapTrend != null ? `${pr.snapTrend >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(pr.snapTrend) * 100)} pts trend` : "last 3 games"} />
        <StatTile label={p.position === "QB" ? "Att + carries / g" : "Targets + carries / g"} value={fmtPts(pr?.oppLast3 ?? null)} sub="last 3 games" />
        <StatTile label="Proj this week" value={p.onBye ? "BYE" : fmtPts(p.projWeek)} sub={`Next 3: ${fmtPts(p.projNext)}`} tone="accent" />
        <StatTile label="Proj rest of season" value={fmtPts(p.projRos, 0)} sub="through the finals" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Game log" subtitle="Fantasy points per week, scored with your league's settings" />
          <div className="px-2 pb-4">{lastWeek ? <GameLogChart data={log} /> : <p className="px-3 text-sm text-ink-3">No completed weeks yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Snap share" subtitle="Share of the team's offensive snaps, by game" />
          <div className="px-2 pb-4">{snaps.length >= 2 ? <TrendLine data={snaps} kind="percent" height={200} /> : <p className="px-3 text-sm text-ink-3">Not enough games with snap data.</p>}</div>
        </Card>
      </div>

      {pr && pr.weekly.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Weekly detail" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="tnum w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="py-2 font-medium">Week</th>
                  <th className="py-2 text-right font-medium">Points</th>
                  <th className="py-2 text-right font-medium">Snap %</th>
                  <th className="py-2 text-right font-medium">{p.position === "QB" ? "Att + car." : "Tgt + car."}</th>
                  <th className="py-2 text-right font-medium">Fantasy</th>
                </tr>
              </thead>
              <tbody>
                {[...pr.weekly].reverse().map((w) => (
                  <tr key={w.week} className="border-t border-line/60">
                    <td className="py-2 text-ink-2">Week {w.week}</td>
                    <td className="py-2 text-right font-medium text-ink">{w.played ? fmtPts(w.points) : <span className="text-ink-3">DNP / bye</span>}</td>
                    <td className="py-2 text-right text-ink-2">{w.snapShare != null ? `${Math.round(w.snapShare * 100)}%` : "—"}</td>
                    <td className="py-2 text-right text-ink-2">{w.opportunities ?? "—"}</td>
                    <td className="py-2 text-right text-ink-3">{w.started == null || !w.played ? "—" : w.started ? "Started" : "Bench"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={6} />}>
      <PlayerPage params={params} />
    </PageSuspense>
  );
}
