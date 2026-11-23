import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { AgeValueChart, WeeklyScoreChart, type AgeValuePoint, type WeeklyPoint } from "@/components/charts";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardHeader, InfoTip, Notice, PageTitle, PosBadge } from "@/components/ui";
import { fmtPts, ordinal } from "@/lib/format";
import { getLeague, myTeam } from "@/lib/server/data";
import type { BacktestReport, MetricKey } from "@/lib/analysis/backtest";
import { STRATEGY_TEXT } from "@/components/ui";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Sequential heat: one hue (series blue) mixed into the surface, deeper = stronger. Capped at 52%
 * so cell text stays in the normal ink color with good contrast in both themes.
 */
const heat = (pct: number): React.CSSProperties => ({
  background: `color-mix(in oklab, var(--series-1) ${Math.round(6 + Math.max(0, Math.min(1, pct)) * 46)}%, var(--surface-2))`,
  color: "var(--ink)",
});

async function Analytics() {
  const { model } = await getLeague();
  const me = myTeam(model);
  const n = model.teams.length;
  const nameOf = (rid: number) => model.teams.find((t) => t.team.rosterId === rid)?.team.teamName ?? `Roster ${rid}`;

  // In-progress weeks have partial live scores, so the trend uses completed weeks only.
  const weekly: WeeklyPoint[] = model.weekly.filter((w) => w.complete).map((w) => {
    const mine = w.teams.find((t) => t.rosterId === model.myRosterId);
    return {
      week: `Wk ${w.week}`,
      mine: mine?.points ?? null,
      median: w.median,
      opponent: mine?.opponentPoints ?? null,
      result: mine?.won == null ? null : `${mine.won ? "W" : "L"} vs ${nameOf(mine.opponentRosterId!)}`,
    };
  });

  const ageValue: AgeValuePoint[] = model.teams
    .filter((t) => t.age.valueWeighted != null)
    .map((t) => ({ name: t.team.teamName, age: t.age.valueWeighted!, value: t.totals.totalValue, mine: t.team.isMine, strategy: STRATEGY_TEXT[t.strategy.effective] }));

  const efficiency = [...model.teams]
    .filter((t) => t.team.potentialPoints)
    .map((t) => ({ t, pf: t.team.pointsFor, pp: t.team.potentialPoints!, eff: t.team.pointsFor / t.team.potentialPoints! }))
    .sort((a, b) => b.eff - a.eff);
  const maxPP = Math.max(...efficiency.map((e) => e.pp), 1);

  // Players who produced on fantasy benches (a signal to investigate, not proof of a bad decision).
  const benched = model.teams
    .flatMap((t) => t.players.map((p) => ({ p, team: t })))
    .filter(({ p }) => p.prod && p.prod.weeksBenched >= 2 && p.prod.benchPoints > 0)
    .sort((a, b) => b.p.prod!.benchPoints - a.p.prod!.benchPoints)
    .slice(0, 15);

  const completeWeeks = model.weekly.filter((w) => w.complete);
  const allScores = completeWeeks.flatMap((w) => w.teams.map((t) => t.points));
  const lo = Math.min(...allScores), hi = Math.max(...allScores);

  return (
    <>
      <PageTitle title="Analytics" subtitle={`${model.scoredWeeks} completed weeks · league scoring · Sleeper matchup data`} />
      {model.scoredWeeks < 3 && <div className="mb-4"><Notice level="info">Small sample: only {model.scoredWeeks} completed weeks. Treat trends as early signals.</Notice></div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={`${me?.team.teamName ?? "My team"}: weekly score`} subtitle="Completed weeks, vs. the league median that week" />
          <div className="px-2 pb-3">{weekly.length ? <WeeklyScoreChart data={weekly} teamName={me?.team.teamName ?? "My team"} /> : <p className="p-6 text-sm text-ink-3">No scored weeks yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Roster age vs. asset value" subtitle="Lines mark the league medians · top-left is young and valuable" info="Top-left = young and valuable (strong long-term position). Bottom-right = older with less value. Values include picks." />
          <div className="px-2 pb-3"><AgeValueChart data={ageValue} /></div>
        </Card>

        <Card>
          <CardHeader
            title="Lineup efficiency"
            subtitle="Points scored (bar) vs. Sleeper's max potential points (track)"
            info="Potential points = what the best possible lineup would have scored each week (Sleeper 'ppts'). The gap is points left on the bench; it includes injuries, byes and late scratches, not only lineup choices."
          />
          <div className="flex items-center gap-4 px-5 pb-2 text-[11px] text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3.5 rounded-full bg-series-1" />Points scored (you)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3.5 rounded-full bg-[var(--chart-neutral)]" />Others</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3.5 rounded-full bg-surface-3" />Potential</span>
          </div>
          <ul className="space-y-2.5 px-5 pb-5">
            {efficiency.map(({ t, pf, pp, eff }) => (
              <li key={t.team.rosterId} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-xs">
                <span className={clsx("truncate", t.team.isMine ? "font-semibold text-ink" : "text-ink-2")}>{t.team.teamName}</span>
                <div className="relative h-2" title={`${pf.toFixed(1)} of ${pp.toFixed(1)} potential`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-surface-3" style={{ width: `${(pp / maxPP) * 100}%` }} />
                  <div className={clsx("animate-grow-x absolute inset-y-0 left-0 rounded-full", t.team.isMine ? "bg-series-1" : "bg-[var(--chart-neutral)]")} style={{ width: `${(pf / maxPP) * 100}%` }} />
                </div>
                <span className="tnum text-right text-ink">{Math.round(eff * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Positional production ranks" subtitle="Rank of each team's top starters' adj. PPG (1 = best); deeper blue = stronger" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="tnum w-full text-xs">
              <thead>
                <tr className="text-ink-3">
                  <th className="py-1 text-left font-medium">Team</th>
                  {model.gradedPositions.map((p) => <th key={p} className="w-14 py-1 text-center"><PosBadge pos={p} /></th>)}
                </tr>
              </thead>
              <tbody>
                {[...model.teams].sort((a, b) => a.powerRank - b.powerRank).map((t) => (
                  <tr key={t.team.rosterId}>
                    <td className={clsx("truncate py-0.5 pr-2", t.team.isMine ? "font-semibold text-ink" : "text-ink-2")}>{t.team.teamName}</td>
                    {model.gradedPositions.map((p) => {
                      const r = t.positions[p].starterRank;
                      const pct = (n - r) / (n - 1);
                      return (
                        <td key={p} className="p-0.5">
                          <div className="rounded-md py-1 text-center font-semibold" style={heat(pct)} title={`${t.positions[p].starterPpg} adj. PPG`}>
                            {r}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Weekly scores" subtitle="Completed weeks; deeper blue = higher score. ● = won head-to-head." />
        <div className="overflow-x-auto px-4 pb-4">
          <table className="tnum w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-ink-3">
                <th className="py-1 text-left font-medium">Team</th>
                {completeWeeks.map((w) => <th key={w.week} className="py-1 text-center font-medium">Wk {w.week}</th>)}
                <th className="py-1 text-right font-medium">Avg</th>
              </tr>
            </thead>
            <tbody>
              {model.standings.map((rid) => {
                const scores = completeWeeks.map((w) => w.teams.find((t) => t.rosterId === rid));
                const avg = scores.reduce((a, s) => a + (s?.points ?? 0), 0) / Math.max(1, scores.length);
                return (
                  <tr key={rid}>
                    <td className={clsx("truncate py-0.5 pr-2", rid === model.myRosterId ? "font-semibold text-ink" : "text-ink-2")}>{nameOf(rid)}</td>
                    {scores.map((s, i) => {
                      const pct = s && hi > lo ? (s.points - lo) / (hi - lo) : 0;
                      return (
                        <td key={i} className="p-0.5">
                          <div className="rounded-md py-1 text-center" style={heat(pct)} title={s?.opponentRosterId ? `vs ${nameOf(s.opponentRosterId)}: ${s.points} – ${s.opponentPoints}` : undefined}>
                            {s ? fmtPts(s.points) : "—"}
                            {s?.won && <span aria-label="won" className="ml-0.5">●</span>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-0.5 text-right text-ink">{fmtPts(avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {model.modelCheck && model.modelCheck.seasons.length > 0 && <ModelCheck report={model.modelCheck} />}

      <Card className="mt-5">
        <CardHeader
          title="Production left on benches"
          subtitle="Players who scored while on a fantasy bench in 2+ completed weeks"
          action={<InfoTip text="A bench designation is a signal to investigate, not proof a manager undervalues a player. Bye weeks, injuries, game-time decisions and roster limits all play a part. Only this league season's matchup data is available." />}
        />
        {benched.length ? (
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[640px] text-sm">
              <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="py-2 pl-4 font-medium">Player</th>
                  <th className="py-2 font-medium">Team</th>
                  <th className="py-2 text-right font-medium">Benched</th>
                  <th className="py-2 text-right font-medium">Bench pts</th>
                  <th className="py-2 text-right font-medium">PPG</th>
                  <th className="py-2 pr-4 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {benched.map(({ p, team }) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="py-2 pl-4"><span className="flex items-center gap-2"><PosBadge pos={p.position} /><span className="text-ink">{p.name}</span></span></td>
                    <td className="py-2"><Link href={team.team.isMine ? "/team" : `/league/${team.team.rosterId}`} className="text-ink-2 hover:underline">{team.team.teamName}</Link></td>
                    <td className="py-2 text-right text-ink-2">{p.prod!.weeksBenched} of {p.prod!.weeksBenched + p.prod!.weeksStarted}</td>
                    <td className="py-2 text-right text-ink">{fmtPts(p.prod!.benchPoints)}</td>
                    <td className="py-2 text-right text-ink-2">{fmtPts(p.prod!.ppg)}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">{p.value?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 text-sm text-ink-3">Not enough completed weeks to identify bench production.</p>
        )}
        {me && efficiency.some((e) => e.t.team.isMine) && (
          <p className="px-4 py-3 text-[11px] text-ink-3">Your lineup efficiency ranks {ordinal(efficiency.findIndex((e) => e.t.team.isMine) + 1)} of {efficiency.length}.</p>
        )}
      </Card>
    </>
  );
}

const METRIC_LABEL: Record<MetricKey, string> = {
  record: "Record (incl. median games)",
  pointsFor: "Points for",
  potential: "Lineup potential (max points)",
  composite: "App's current-strength blend",
};

function ModelCheck({ report }: { report: BacktestReport }) {
  const keys: MetricKey[] = ["composite", "pointsFor", "record", "potential"];
  const best = report.average ? keys.reduce((a, b) => (report.average![b] > report.average![a] ? b : a)) : null;
  return (
    <Card className="mt-5">
      <CardHeader
        title="Model check: past seasons"
        subtitle={`How well each signal after week ${report.checkpointWeek} predicted the final regular-season standings`}
        info="Spearman rank correlation between each team's metric after the checkpoint week and its final regular-season standing (1.0 = perfect order). Playoff hits = how many eventual playoff teams were in that metric's top group. The strategy weights were adjusted using this check."
      />
      <div className="overflow-x-auto">
        <table className="tnum w-full text-sm">
          <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
            <tr>
              <th className="py-2 pl-4 font-medium">Signal</th>
              {report.seasons.map((s) => <th key={s.season} className="py-2 text-right font-medium">{s.season}</th>)}
              <th className="py-2 pr-4 text-right font-medium">Average ρ</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className={clsx("border-b border-line/60", k === "composite" && "bg-brand-blue/10")}>
                <td className="py-2 pl-4 text-ink">{METRIC_LABEL[k]}</td>
                {report.seasons.map((s) => (
                  <td key={s.season} className="py-2 text-right text-ink-2">
                    ρ {s.rho[k].toFixed(2)} <span className="text-[11px] text-ink-3">· {s.playoffHits[k]}/{s.playoffTeams}</span>
                  </td>
                ))}
                <td className={clsx("py-2 pr-4 text-right font-medium", k === best ? "text-accent" : "text-ink")}>{report.average?.[k].toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-ink-3">
        Two seasons is a small sample, so weights were nudged rather than fitted: the blend now leans more on points for and record than the original version, while still valuing current lineup strength (which captures trades and injuries that past results can&apos;t).
      </p>
    </Card>
  );
}

export default function Page() {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <Analytics />
    </PageSuspense>
  );
}
