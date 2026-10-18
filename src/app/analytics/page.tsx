import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AgeValueChart, WeeklyScoreChart, type AgeValuePoint, type WeeklyPoint } from "@/components/charts";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardHeader, InfoTip, Notice, PageTitle, PosBadge } from "@/components/ui";
import { SKILL_POSITIONS } from "@/lib/league/models";
import { fmtPts, ordinal } from "@/lib/format";
import { getLeague, myTeam } from "@/lib/server/data";
import { STRATEGY_TEXT } from "@/components/ui";

export const metadata: Metadata = { title: "Analytics" };

/** Sequential blue ramp (validated reference steps), dark → light means worse → better on the dark surface. */
const RAMP = ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef"];
const rampFor = (pct: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(pct * (RAMP.length - 1))))];

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
          <CardHeader title={`${me?.team.teamName ?? "My team"}: weekly score`} subtitle="Blue: your score · gray: league median that week · completed weeks" />
          <div className="px-2 pb-3">{weekly.length ? <WeeklyScoreChart data={weekly} teamName={me?.team.teamName ?? "My team"} /> : <p className="p-6 text-sm text-ink-3">No scored weeks yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Roster age vs. asset value" subtitle="Each dot is a team; yours is highlighted" info="Top-left = young and valuable (strong long-term position). Bottom-right = older with less value. Values include picks." />
          <div className="px-2 pb-3"><AgeValueChart data={ageValue} /></div>
        </Card>

        <Card>
          <CardHeader
            title="Lineup efficiency"
            subtitle="Points scored (bar) vs. Sleeper's max potential points (track)"
            info="Potential points = what the best possible lineup would have scored each week (Sleeper 'ppts'). The gap is points left on the bench; it includes injuries, byes and late scratches, not only lineup choices."
          />
          <ul className="space-y-2 px-4 pb-4">
            {efficiency.map(({ t, pf, pp, eff }) => (
              <li key={t.team.rosterId} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-xs">
                <span className={clsx("truncate", t.team.isMine ? "font-semibold text-ink" : "text-ink-2")}>{t.team.teamName}</span>
                <div className="relative h-3" title={`${pf.toFixed(1)} of ${pp.toFixed(1)} potential`}>
                  <div className="absolute inset-y-0 left-0 rounded-r bg-brand-blue/20" style={{ width: `${(pp / maxPP) * 100}%` }} />
                  <div className={clsx("absolute inset-y-0 left-0 rounded-r", t.team.isMine ? "bg-brand-blue" : "bg-ink-3")} style={{ width: `${(pf / maxPP) * 100}%` }} />
                </div>
                <span className="tnum text-right text-ink">{Math.round(eff * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Positional production ranks" subtitle="Rank of each team's top starters' adj. PPG (1 = best); lighter = stronger" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="tnum w-full text-xs">
              <thead>
                <tr className="text-ink-3">
                  <th className="py-1 text-left font-medium">Team</th>
                  {SKILL_POSITIONS.map((p) => <th key={p} className="w-14 py-1 text-center"><PosBadge pos={p} /></th>)}
                </tr>
              </thead>
              <tbody>
                {[...model.teams].sort((a, b) => a.powerRank - b.powerRank).map((t) => (
                  <tr key={t.team.rosterId}>
                    <td className={clsx("truncate py-0.5 pr-2", t.team.isMine ? "font-semibold text-ink" : "text-ink-2")}>{t.team.teamName}</td>
                    {SKILL_POSITIONS.map((p) => {
                      const r = t.positions[p].starterRank;
                      const pct = (n - r) / (n - 1);
                      return (
                        <td key={p} className="p-0.5">
                          <div className="rounded py-1 text-center font-semibold" style={{ background: rampFor(pct), color: pct > 0.55 ? "#0a1020" : "#e8edf6" }} title={`${t.positions[p].starterPpg} adj. PPG`}>
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
        <CardHeader title="Weekly scores" subtitle="Completed weeks; lighter cells are higher scores. ● = won head-to-head." />
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
                          <div className="rounded py-1 text-center" style={{ background: rampFor(pct), color: pct > 0.55 ? "#0a1020" : "#e8edf6" }} title={s?.opponentRosterId ? `vs ${nameOf(s.opponentRosterId)}: ${s.points} – ${s.opponentPoints}` : undefined}>
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

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Analytics />
    </Suspense>
  );
}
