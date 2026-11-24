import Link from "next/link";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { PlayerAvatar } from "@/components/avatar";
import { StandingsTable } from "@/components/league/standings-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Recommendations } from "@/components/team/recommendations";
import { TeamHeader } from "@/components/team/team-panels";
import { ProposalSummary } from "@/components/trades/proposal-summary";
import { ValueMoversCard } from "@/components/team/value-movers";
import { ThisWeekCard } from "@/components/week/this-week-card";
import { GuestOverview } from "@/components/league/guest-overview";
import { TrendsCard } from "@/components/team/trends-card";
import { rankMovement, readSnapshots } from "@/lib/snapshots/store";
import { Card, CardHeader, Notice, PosBadge, Skeleton, STRATEGY_TEXT } from "@/components/ui";
import { setImmediate as yieldToStream } from "node:timers/promises";
import { getLeague, myTeam } from "@/lib/server/data";
import { defaultTrades, myRecommendations } from "@/lib/server/insights";
import { buildWaiverBoard } from "@/lib/analysis/waivers";
import { TierBadge } from "@/components/waivers/waiver-explorer";
import { fmtPts } from "@/lib/format";
import { tradeWindow, tradeWindowNote } from "@/lib/league/trade-window";

async function Dashboard() {
  const { model } = await getLeague();
  const snaps = await readSnapshots(model.league.id);
  const t = myTeam(model);
  if (!t) return <GuestOverview model={model} />;
  const errors = model.issues.filter((i) => i.level === "error");
  const waiverTop = buildWaiverBoard(model, t, model.league.waiverBudget)
    .candidates.filter((c) => c.tier === "Strong add" || c.tier === "Worth a look" || c.lineupGain > 0.05)
    .slice(0, 4);

  return (
    <>
      {errors.map((e) => (
        <div key={e.code} className="mb-4">
          <Notice level="error">{e.message}</Notice>
        </div>
      ))}
      <TeamHeader t={t} n={model.teams.length} odds={model.odds?.teams.find((o) => o.rosterId === t.team.rosterId)} />

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <ThisWeekCard model={model} t={t} />
          <Suspense fallback={<TradeCardsSkeleton />}>
            <DashboardTradeCards />
          </Suspense>

          <Card>
            <CardHeader title="Standings" action={<Link href="/league" className="text-xs text-accent hover:underline">League →</Link>} />
            <StandingsTable model={model} compact movement={rankMovement(snaps, model)} />
          </Card>
        </div>

        <div className="space-y-5">
          <TrendsCard model={model} t={t} mineOnly />
          <Card>
            <CardHeader title="Waiver wire" subtitle="Best available pickups for your roster" action={<Link href="/waivers" className="text-xs text-accent hover:underline">All →</Link>} />
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
          <ValueMoversCard t={t} model={model} />
          <Card>
            <CardHeader title="Recent activity" action={<Link href="/league#activity" className="text-xs text-accent hover:underline">All →</Link>} />
            <ActivityFeed model={model} limit={3} />
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * Recommendations and trade ideas need the trade engine and season simulation, which can take a
 * moment on a cold server. They stream in after the rest of the dashboard is on screen.
 */
async function DashboardTradeCards() {
  const { model, prefs } = await getLeague();
  const t = myTeam(model);
  if (!t) return null;
  // Yield once so the dashboard shell flushes before the (synchronous) trade search runs.
  await yieldToStream();
  const recs = myRecommendations(model, prefs);
  const tw = tradeWindow(model.league);
  const tradeNote = tradeWindowNote(tw);
  const trades = defaultTrades(model, prefs, t.strategy.effective).slice(0, 2);
  return (
    <>
          {recs && (
            <Card>
              <CardHeader title="Recommended next actions" subtitle="The moves that help your team most right now" action={<Link href="/team" className="text-xs text-accent hover:underline">Full analysis →</Link>} />
              <Recommendations recs={recs} recommended={t.strategy.effective} limit={3} />
            </Card>
          )}

          <Card>
            <CardHeader
              title="Best trade opportunities"
              subtitle={`Ranked for a ${STRATEGY_TEXT[t.strategy.effective].toLowerCase()} · deals the other side should accept`}
              action={<Link href="/trades" className="text-xs text-accent hover:underline">Trade Hub →</Link>}
            />
            {tradeNote && (
              <div className="px-4 pb-3">
                <Notice level={tw.state === "open" ? "info" : "warning"}>{tradeNote}</Notice>
              </div>
            )}
            {trades.length ? (
              <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                {trades.map((e) => (
                  <div key={e.id} className="rounded-lg border border-line p-3">
                    <ProposalSummary e={e} compact />
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 pb-4 text-sm text-ink-3">No realistic deals right now. Try a different goal in the Trade Hub.</p>
            )}
          </Card>
    </>
  );
}

function TradeCardsSkeleton() {
  return (
    <>
      <Card>
        <CardHeader title="Recommended next actions" subtitle="Finding your best moves…" />
        <div className="space-y-2 px-4 pb-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </Card>
      <Card>
        <CardHeader title="Best trade opportunities" subtitle="Simulating odds for each idea…" />
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={6} />}>
      <Dashboard />
    </PageSuspense>
  );
}
