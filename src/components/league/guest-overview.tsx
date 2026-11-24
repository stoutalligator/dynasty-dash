import { ArrowRight, Eye } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { Avatar } from "@/components/avatar";
import { OddsTable } from "@/components/league/odds-table";
import { StandingsTable } from "@/components/league/standings-table";
import { Card, CardHeader, StrategyBadge } from "@/components/ui";
import type { LeagueModel } from "@/lib/analysis/types";
import { record } from "@/lib/format";

/** Banner for visitors viewing a league they don't have a team in. */
export function GuestBanner({ model, children }: { model: LeagueModel; children?: ReactNode }) {
  const l = model.league;
  return (
    <div className="surface-card hero-surface relative mb-5 overflow-hidden rounded-2xl border border-line">
      <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <Avatar src={l.avatarUrl} name={l.name} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[26px]">{l.name}</h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-2">
              <Eye aria-hidden className="size-3.5" /> Viewing as a guest
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-3">{children ?? "You're not on a team in this league, so team tools are off. Every team's page is open to browse."}</p>
        </div>
        <Link href="/setup" className="btn-primary inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink">
          Sign in as yourself <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/** Every team in the league, linking to its profile. */
export function TeamDirectory({ model }: { model: LeagueModel }) {
  return (
    <Card>
      <CardHeader title="Teams" subtitle="Open any team's roster, outlook and picks" />
      <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
        {model.standings.map((rid) => {
          const t = model.teams.find((x) => x.team.rosterId === rid)!;
          return (
            <li key={rid}>
              <Link href={`/league/${rid}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2">
                <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{t.team.teamName}</span>
                  <span className="text-xs text-ink-3">{record(t.team.wins, t.team.losses, t.team.ties)} · #{t.standingRank}</span>
                </span>
                <StrategyBadge strategy={t.strategy.effective} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** League-wide dashboard for guests: standings, odds, activity and every team. */
export function GuestOverview({ model }: { model: LeagueModel }) {
  return (
    <>
      <GuestBanner model={model} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Standings" action={<Link href="/league" className="text-xs text-accent hover:underline">League →</Link>} />
            <StandingsTable model={model} />
          </Card>
          {model.odds && (
            <Card>
              <CardHeader title="Playoff odds" subtitle={`${model.odds.runs.toLocaleString()} simulated seasons`} />
              <OddsTable model={model} />
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Recent activity" action={<Link href="/league#activity" className="text-xs text-accent hover:underline">All →</Link>} />
            <ActivityFeed model={model} limit={8} />
          </Card>
        </div>
      </div>
      <div className="mt-5">
        <TeamDirectory model={model} />
      </div>
    </>
  );
}
