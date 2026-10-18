import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { Avatar } from "@/components/avatar";
import { StandingsTable, StrategyDistribution } from "@/components/league/standings-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { Tabs } from "@/components/tabs";
import { Card, CardHeader, ConfidenceBadge, InfoTip, PageTitle, StatTile, StrategyBadge } from "@/components/ui";
import { leagueOpportunities } from "@/lib/analysis/recommendations";
import type { LeagueModel } from "@/lib/analysis/types";
import { SKILL_POSITIONS } from "@/lib/league/models";
import { fmtAge, fmtInt, fmtPts, ordinal } from "@/lib/format";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "League" };

function gradeColor(grade: string) {
  return grade.startsWith("A") ? "text-accent" : grade.startsWith("B") ? "text-brand-blue" : grade.startsWith("C") ? "text-ink-2" : "text-serious";
}

function PowerRankings({ model }: { model: LeagueModel }) {
  const rows = [...model.teams].sort((a, b) => a.powerRank - b.powerRank);
  return (
    <Card>
      <CardHeader
        title="Power rankings"
        subtitle="Current strength, not record alone"
        info="Power rank sorts by the current-strength score: best-lineup adj. PPG (45%), points for (20%), potential points (15%), win % (20%), each as a league percentile."
      />
      <div className="overflow-x-auto">
        <table className="tnum w-full text-sm md:min-w-[820px]">
          <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
            <tr>
              <th className="w-10 py-2 pl-4 font-medium">PR</th>
              <th className="py-2 font-medium">Team</th>
              <th className="w-20 py-2 text-right font-medium">Now</th>
              <th className="hidden w-20 py-2 text-right font-medium sm:table-cell">Future</th>
              <th className="hidden w-24 py-2 text-right font-medium md:table-cell">Lineup</th>
              {SKILL_POSITIONS.map((p) => <th key={p} className="hidden w-12 py-2 text-center font-medium md:table-cell">{p}</th>)}
              <th className="hidden w-20 py-2 text-right font-medium md:table-cell">Age</th>
              <th className="hidden w-24 py-2 text-right font-medium sm:table-cell">Value</th>
              <th className="w-28 py-2 pr-4 pl-3 font-medium">Outlook</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.team.rosterId} className={clsx("border-b border-line/60 hover:bg-surface-2/60", t.team.isMine && "bg-brand-blue/10")}>
                <td className="py-2 pl-4 font-semibold text-ink">{t.powerRank}</td>
                <td className="py-2">
                  <Link href={t.team.isMine ? "/team" : `/league/${t.team.rosterId}`} className="flex items-center gap-2 hover:underline">
                    <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={22} />
                    <span className="truncate text-ink">{t.team.teamName}</span>
                  </Link>
                </td>
                <td className="py-2 text-right text-ink">{Math.round(t.strategy.nowScore * 100)}</td>
                <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{Math.round(t.strategy.futureScore * 100)}</td>
                <td className="hidden py-2 text-right text-ink-2 md:table-cell">{fmtPts(t.lineup.total)}</td>
                {SKILL_POSITIONS.map((p) => (
                  <td key={p} className={clsx("hidden py-2 text-center text-xs font-semibold md:table-cell", gradeColor(t.positions[p].overall.grade))}>{t.positions[p].overall.grade}</td>
                ))}
                <td className="hidden py-2 text-right text-ink-2 md:table-cell">{fmtAge(t.age.valueWeighted)}</td>
                <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{fmtInt(t.totals.totalValue)}</td>
                <td className="py-2 pr-4 pl-3"><StrategyBadge strategy={t.strategy.effective} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TeamProfiles({ model }: { model: LeagueModel }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[...model.teams].sort((a, b) => a.powerRank - b.powerRank).map((t) => (
        <Link
          key={t.team.rosterId}
          href={t.team.isMine ? "/team" : `/league/${t.team.rosterId}`}
          className={clsx("block rounded-xl border bg-surface p-4 transition hover:border-line-strong hover:bg-surface-2/40", t.team.isMine ? "border-brand-blue/50" : "border-line")}
        >
          <div className="flex items-center gap-3">
            <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{t.team.teamName}</div>
              <div className="text-xs text-ink-3">{t.team.wins}-{t.team.losses} · PR #{t.powerRank} · {t.team.manager?.displayName}</div>
            </div>
            <StrategyBadge strategy={t.strategy.effective} />
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1 text-center">
            {SKILL_POSITIONS.map((p) => (
              <div key={p} className="rounded-md bg-surface-2/70 py-1">
                <div className="text-[10px] text-ink-3">{p}</div>
                <div className={clsx("text-sm font-semibold", gradeColor(t.positions[p].overall.grade))}>{t.positions[p].overall.grade}</div>
              </div>
            ))}
            <div className="rounded-md bg-surface-2/70 py-1">
              <div className="text-[10px] text-ink-3">Depth</div>
              <div className={clsx("text-sm font-semibold", gradeColor(t.depth.grade))}>{t.depth.grade}</div>
            </div>
            <div className="rounded-md bg-surface-2/70 py-1">
              <div className="text-[10px] text-ink-3">Picks</div>
              <div className={clsx("text-sm font-semibold", gradeColor(t.capital.grade))}>{t.capital.grade}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs text-ink-2">
            <div><span className="text-ink-3">Needs:</span> {t.needs.map((n) => n.position).join(", ") || "none flagged"}</div>
            <div><span className="text-ink-3">Age:</span> {fmtAge(t.age.valueWeighted)} value-weighted · <span className="text-ink-3">Picks:</span> {t.capital.firsts} 1sts, {t.capital.seconds} 2nds</div>
          </div>
          <div className="mt-2"><ConfidenceBadge confidence={t.strategy.confidence} /></div>
        </Link>
      ))}
    </div>
  );
}

function Opportunities({ model }: { model: LeagueModel }) {
  const o = leagueOpportunities(model);
  const nameLink = (rid: number, name: string) => (
    <Link key={rid} href={rid === model.myRosterId ? "/team" : `/league/${rid}`} className="text-ink hover:underline">{name}</Link>
  );
  const join = (nodes: React.ReactNode[]) => nodes.flatMap((n, i) => (i ? [", ", n] : [n]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Contenders with lineup holes" subtitle="Likely buyers of immediate starters" />
        <ul className="space-y-2 px-4 pb-4 text-sm text-ink-2">
          {o.contendersNeeding.length ? o.contendersNeeding.map((c) => (
            <li key={c.rosterId}>{nameLink(c.rosterId, c.teamName)} — weak at {c.needs.join(", ")}</li>
          )) : <li className="text-ink-3">No contender has a bottom-third position.</li>}
        </ul>
      </Card>
      {model.league.format.superflex && (
        <Card>
          <CardHeader title="Superflex QB scarcity" subtitle="Teams whose top QBs rank in the league's bottom third" info="In superflex, every team wants two startable QBs. These teams are the most likely QB buyers." />
          <ul className="space-y-2 px-4 pb-4 text-sm text-ink-2">
            {o.qbWeak.length ? o.qbWeak.map((q) => <li key={q.rosterId}>{nameLink(q.rosterId, q.teamName)} — {ordinal(q.rank)} in QB production</li>) : <li className="text-ink-3">None.</li>}
          </ul>
        </Card>
      )}
      <Card className="lg:col-span-2">
        <CardHeader title="Positional surplus" subtitle="Teams with top-quarter depth (backup production) at each position" info="Depth is a signal to investigate, not proof a manager will sell. A bench player may be stashed for injuries, byes or upside." />
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {o.surplusByPos.map((s) => (
            <div key={s.position}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{s.position}</div>
              <ul className="space-y-1 text-sm text-ink-2">
                {s.teams.map((t) => <li key={t.rosterId}>{nameLink(t.rosterId, t.teamName)} <span className="text-ink-3">· {fmtPts(t.depthPpg)} depth PPG</span></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-ink-3">Rebuilding teams: {join(model.teams.filter((t) => t.strategy.effective === "rebuild").map((t) => nameLink(t.team.rosterId, t.team.teamName)))}. They are most likely to value picks and young players over current production.</p>
      </Card>
    </div>
  );
}

function LeagueSettings({ model }: { model: LeagueModel }) {
  const l = model.league;
  const scoring = Object.entries(l.scoringSettings).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b));
  const rows: [string, string][] = [
    ["League ID", l.id],
    ["Status", `${l.status.replace("_", " ")} · week ${l.currentWeek ?? "—"} (last scored ${l.lastScoredWeek ?? "—"})`],
    ["Format", `${l.totalRosters} teams · ${l.format.scoringLabel} · ${l.format.superflex ? "Superflex" : "1QB"}${l.format.tePremium ? "" : " · no TE premium"}`],
    ["Starting lineup", l.startingSlots.map((s) => s.replace("SUPER_FLEX", "SF")).join(", ")],
    ["Roster", `${l.startingSlots.length} starters + ${l.benchSlots} bench · ${l.taxiSlots} taxi · ${l.reserveSlots} IR`],
    ["Rookie draft", `${l.draftRounds ?? "—"} rounds`],
    ["Playoffs", `${l.playoffTeams ?? "—"} teams from week ${l.playoffWeekStart ?? "—"}`],
    ["Trade deadline", l.tradeDeadline ? `Week ${l.tradeDeadline}` : "—"],
    ["Divisions", l.divisions.map((d) => d.name).join(" · ") || "None"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="League settings" subtitle="Live from Sleeper" />
        <dl className="divide-y divide-line/60 px-4 pb-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-2">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardHeader title="Scoring settings" subtitle="All non-zero values (Sleeper keys)" />
        <dl className="tnum grid grid-cols-2 gap-x-6 px-4 pb-4 text-[13px] sm:grid-cols-3">
          {scoring.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line/40 py-1">
              <dt className="truncate text-ink-3">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

async function League() {
  const { model } = await getLeague();
  const l = model.league;
  const avgRoster = model.teams.reduce((a, t) => a + t.players.length, 0) / model.teams.length;
  return (
    <>
      <PageTitle title="League overview" subtitle={`${l.name} · ${l.season}`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Teams" value={l.totalRosters} sub={`${l.divisions.length} divisions`} />
        <StatTile label="Scoring" value={l.format.scoringLabel} sub={l.format.tePremium ? "TE premium" : "No TE premium"} />
        <StatTile label="Format" value={l.format.superflex ? "Superflex" : "1QB"} sub={`${l.startingSlots.length} starters`} />
        <StatTile label="Avg roster size" value={avgRoster.toFixed(1)} sub={`incl. taxi & IR`} />
      </div>
      <Tabs
        tabs={[
          { key: "standings", label: "Standings" },
          { key: "power", label: "Power rankings" },
          { key: "teams", label: "Team profiles" },
          { key: "opportunities", label: "Opportunities" },
          { key: "activity", label: "Activity" },
          { key: "settings", label: "League settings" },
        ]}
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Standings" subtitle={l.divisions.length ? "Division in team profile" : undefined} />
            <StandingsTable model={model} />
          </Card>
          <Card>
            <CardHeader title="League distribution" info="Strategy is inferred per team from lineup strength, results, age, and draft capital, and can be overridden on any team's page." />
            <StrategyDistribution model={model} />
          </Card>
        </div>
        <PowerRankings model={model} />
        <TeamProfiles model={model} />
        <Opportunities model={model} />
        <Card>
          <CardHeader title="League activity" subtitle="Completed trades, waivers and free-agent moves this season" action={<InfoTip text="Sleeper reports transactions per league week. Offseason moves appear in week 1. History before this league season lives in the previous league id and is not loaded yet." />} />
          <ActivityFeed model={model} limit={60} />
        </Card>
        <LeagueSettings model={model} />
      </Tabs>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <League />
    </Suspense>
  );
}
