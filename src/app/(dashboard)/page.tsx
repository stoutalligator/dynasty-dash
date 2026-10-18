import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { PlayerAvatar } from "@/components/avatar";
import { StandingsTable, StrategyDistribution } from "@/components/league/standings-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { Recommendations } from "@/components/team/recommendations";
import { PicksCard, PositionGradesCard, StrategyCard, TeamHeader, TeamStatTiles } from "@/components/team/team-panels";
import { ProposalSummary } from "@/components/trades/proposal-summary";
import { Card, CardHeader, InjuryBadge, Notice, PosBadge } from "@/components/ui";
import { getLeague, myTeam } from "@/lib/server/data";
import { defaultTrades, myRecommendations } from "@/lib/server/insights";
import { buildWaiverBoard } from "@/lib/analysis/waivers";
import { TierBadge } from "@/components/waivers/waiver-explorer";
import { fmtPts } from "@/lib/format";

async function Dashboard() {
  const { model, prefs } = await getLeague();
  const t = myTeam(model);
  if (!t) {
    return (
      <Notice level="error">
        Your team could not be verified. {model.verification.notes.join(" ")} <Link href="/settings" className="underline">Check settings</Link>.
      </Notice>
    );
  }
  const recs = myRecommendations(model, prefs);
  const trades = defaultTrades(model, prefs, t.strategy.effective).slice(0, 3);
  const injured = t.players.filter((p) => p.injury && p.slot !== "taxi").sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const errors = model.issues.filter((i) => i.level === "error");
  const waiverTop = buildWaiverBoard(model, t, model.league.waiverBudget)
    .candidates.filter((c) => c.tier === "Strong add" || c.tier === "Worth a look" || c.lineupGain > 0.05)
    .slice(0, 5);

  return (
    <>
      {errors.map((e) => (
        <div key={e.code} className="mb-4">
          <Notice level="error">{e.message}</Notice>
        </div>
      ))}
      <TeamHeader t={t} n={model.teams.length} />
      <TeamStatTiles t={t} model={model} />

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {recs && (
            <Card>
              <CardHeader title="Recommended next actions" subtitle="Grounded in your roster, the league, and the trade engine" action={<Link href="/team" className="text-xs text-accent hover:underline">Full analysis →</Link>} />
              <Recommendations recs={recs} recommended={t.strategy.effective} limit={4} />
            </Card>
          )}

          <Card>
            <CardHeader
              title="Best trade opportunities"
              subtitle={`Objective: ${t.strategy.effective} · ranked by benefit to you, with the partner's incentives weighed in`}
              action={<Link href="/trades" className="text-xs text-accent hover:underline">Trade Hub →</Link>}
            />
            {trades.length ? (
              <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 2xl:grid-cols-3">
                {trades.map((e) => (
                  <div key={e.id} className="rounded-lg border border-line p-3">
                    <ProposalSummary e={e} compact />
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 pb-4 text-sm text-ink-3">No proposals met the realism filters. Try other objectives in the Trade Hub.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Standings" action={<Link href="/league" className="text-xs text-accent hover:underline">League →</Link>} />
            <StandingsTable model={model} />
          </Card>
        </div>

        <div className="space-y-5">
          <StrategyCard t={t} />
          <PositionGradesCard t={t} model={model} />
          <Card>
            <CardHeader title="League outlook" subtitle="Inferred from observable data; overrides respected" />
            <StrategyDistribution model={model} />
          </Card>
          <Card>
            <CardHeader title="Injuries & status" subtitle="Your roster · Sleeper player data" />
            {injured.length ? (
              <ul className="divide-y divide-line/60 px-4 pb-2">
                {injured.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 py-2 text-sm">
                    <PlayerAvatar id={p.id} name={p.name} size={24} />
                    <span className="flex-1 truncate text-ink">{p.name}</span>
                    <PosBadge pos={p.position} />
                    <InjuryBadge injury={p.injury} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 pb-4 text-sm text-ink-3">
                <AlertTriangle className="size-4" aria-hidden /> No injury designations on your active roster.
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Waiver wire" subtitle="Top free agents by pickup score" action={<Link href="/waivers" className="text-xs text-accent hover:underline">All →</Link>} />
            {waiverTop.length ? (
              <ul className="divide-y divide-line/60 px-4 pb-2">
                {waiverTop.map((c) => (
                  <li key={c.player.id} className="flex items-center gap-2.5 py-2 text-sm">
                    <PlayerAvatar id={c.player.id} name={c.player.name} size={24} />
                    <PosBadge pos={c.player.position} />
                    <span className="min-w-0 flex-1 truncate text-ink">{c.player.name}</span>
                    {c.lineupGain > 0.05 && <span className="tnum text-xs text-accent">+{fmtPts(c.lineupGain)}</span>}
                    <TierBadge tier={c.tier} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-sm text-ink-3">No standout free agents right now.</p>
            )}
          </Card>
          <PicksCard t={t} model={model} />
          <Card>
            <CardHeader title="Recent league activity" action={<Link href="/league#activity" className="text-xs text-accent hover:underline">All →</Link>} />
            <ActivityFeed model={model} limit={6} />
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={6} />}>
      <Dashboard />
    </Suspense>
  );
}
