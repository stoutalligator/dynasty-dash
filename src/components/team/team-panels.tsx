import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Card, CardHeader, ConfidenceBadge, GradeBar, InfoTip, StatTile, StrategyBadge } from "@/components/ui";
import type { LeagueModel, TeamAnalysis } from "@/lib/analysis/types";
import { SKILL_POSITIONS } from "@/lib/league/models";
import { fmtAge, fmtInt, fmtPts, ordinal, record } from "@/lib/format";
import { Tabs } from "@/components/tabs";
import { StrategyOverride } from "./strategy-override";

export function TeamHeader({ t, n }: { t: TeamAnalysis; n: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{t.team.teamName}</h1>
          <StrategyBadge strategy={t.strategy.effective} size="md" />
          {t.strategy.override && <span className="text-[11px] text-ink-3">manual · model says {t.strategy.inferred}</span>}
        </div>
        <p className="mt-1 text-sm text-ink-3">
          {t.team.manager?.displayName ?? "No manager"} · {record(t.team.wins, t.team.losses, t.team.ties)} · {ordinal(t.standingRank)} of {n}
          {t.team.divisionName && ` · ${t.team.divisionName}`}
          {t.team.streak && ` · ${t.team.streak} streak`}
        </p>
      </div>
    </div>
  );
}

export function TeamStatTiles({ t, model }: { t: TeamAnalysis; model: LeagueModel }) {
  const n = model.teams.length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatTile label="Record" value={record(t.team.wins, t.team.losses, t.team.ties)} sub={`${ordinal(t.standingRank)} in standings`} />
      <StatTile label="Points for" value={fmtPts(t.team.pointsFor)} sub={`Against ${fmtPts(t.team.pointsAgainst)}`} />
      <StatTile label="Potential points" value={fmtPts(t.team.potentialPoints)} sub={t.team.potentialPoints ? `${Math.round((t.team.pointsFor / t.team.potentialPoints) * 100)}% lineup efficiency` : "Not provided"} />
      <StatTile label="Best lineup" value={`${fmtPts(t.lineup.total)}`} sub={`adj. PPG · ${ordinal(t.lineup.rank)} of ${n}`} tone="accent" />
      <StatTile label="Power rank" value={`#${t.powerRank}`} sub="Lineup + results blend" />
      <StatTile label="Asset value" value={fmtInt(t.totals.totalValue)} sub={`${ordinal(t.totals.valueRank)} · ${model.valuation.label}`} />
    </div>
  );
}

export function PositionGradesCard({ t, model }: { t: TeamAnalysis; model: LeagueModel }) {
  const n = model.teams.length;
  return (
    <Card>
      <CardHeader
        title="Positional strength"
        subtitle={`Grades vs. the other ${n - 1} teams`}
        info="Each position grade blends production rank (60%: adjusted PPG of your top players at the position, sized to how many this league typically starts) with dynasty value rank (40%)."
      />
      <div className="space-y-3 px-4 pb-4">
        {SKILL_POSITIONS.map((pos) => {
          const g = t.positions[pos];
          return (
            <GradeBar
              key={pos}
              label={pos}
              score={g.overall.score}
              grade={g.overall.grade}
              detail={`Top ${model.startersPerPosition[pos]}: ${g.starterPpg} adj. PPG (${ordinal(g.starterRank)}) · value ${fmtInt(g.value)} (${ordinal(g.valueRank)})`}
            />
          );
        })}
        <GradeBar label="Depth" score={t.depth.score} grade={t.depth.grade} detail={`Backups' adj. PPG rank ${ordinal(t.depth.rank)}`} />
        <GradeBar label="Picks" score={t.capital.score} grade={t.capital.grade} detail={`Draft capital rank ${ordinal(t.capital.rank)}`} />
      </div>
      <div className="grid grid-cols-4 border-t border-line text-center text-[11px]">
        {SKILL_POSITIONS.map((pos) => (
          <div key={pos} className="border-r border-line px-1 py-2 last:border-r-0">
            <div className="text-ink-3">{pos} prod.</div>
            <div className="tnum font-medium text-ink">{ordinal(t.positions[pos].starterRank)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StrategyCard({ t, editable }: { t: TeamAnalysis; editable?: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Team outlook"
        info="Current strength blends best-lineup PPG (45%), points for (20%), potential points (15%) and win % (20%), each as a league percentile. ≥62 = contender, ≤38 = rebuilder. These are estimates from observable data, not knowledge of a manager's intent."
        action={<StrategyBadge strategy={t.strategy.effective} size="md" />}
      />
      <div className="space-y-3 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge confidence={t.strategy.confidence} />
          <span className="text-[11px] text-ink-3">
            Now {Math.round(t.strategy.nowScore * 100)} · Future {Math.round(t.strategy.futureScore * 100)}
          </span>
        </div>
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
          {t.strategy.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
              {r}
            </li>
          ))}
        </ul>
        {editable && <StrategyOverride rosterId={t.team.rosterId} inferred={t.strategy.inferred} override={t.strategy.override} />}
      </div>
    </Card>
  );
}

export function NeedsCard({ t, model }: { t: TeamAnalysis; model: LeagueModel }) {
  const surplus = t.surplusIds.map((id) => t.players.find((p) => p.id === id)!).filter(Boolean);
  return (
    <Card>
      <CardHeader title="Strengths, needs & surplus" />
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Strengths</h3>
          {t.strengths.length ? (
            <ul className="space-y-1 text-[13px] text-ink-2">{t.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          ) : (
            <p className="text-[13px] text-ink-3">No position grades in the league&apos;s top quarter.</p>
          )}
          <h3 className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Weaknesses</h3>
          {t.weaknesses.length ? (
            <ul className="space-y-1 text-[13px] text-ink-2">{t.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
          ) : (
            <p className="text-[13px] text-ink-3">No position grades in the league&apos;s bottom third.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Lineup needs</h3>
          {t.needs.length ? (
            <ul className="space-y-1 text-[13px] text-ink-2">{t.needs.map((nd) => <li key={nd.position}>{nd.reason}</li>)}</ul>
          ) : (
            <p className="text-[13px] text-ink-3">Every position produces above the league&apos;s bottom third.</p>
          )}
          <h3 className="mt-3 mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
            Surplus <InfoTip text="Players outside the best lineup with value ≥ 1,500 at a position where this team's depth ranks in the league's top third." />
          </h3>
          {surplus.length ? (
            <p className="text-[13px] text-ink-2">{surplus.map((p) => `${p.name} (${p.position})`).join(", ")}</p>
          ) : (
            <p className="text-[13px] text-ink-3">No clear positional surplus.</p>
          )}
          <p className="mt-3 text-[11px] text-ink-3">
            Age: value-weighted {fmtAge(t.age.valueWeighted)} ({ordinal(t.age.youthRank)} youngest of {model.teams.length}); best-lineup average {fmtAge(t.age.lineupAvg)}; {Math.round(t.age.ageRiskValueShare * 100)}% of value past typical decline age.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function PicksCard({ t, model }: { t: TeamAnalysis; model: LeagueModel }) {
  return (
    <Card>
      <CardHeader
        title="Draft capital"
        subtitle={`${t.capital.firsts} firsts · ${t.capital.seconds} seconds · ${t.capital.total} total`}
        action={<Link href="/picks" className="text-xs text-accent hover:underline">All picks →</Link>}
      />
      <div className="px-4 pb-4">
        {model.pickSeasons.map((season) => {
          const ps = t.picks.filter((p) => p.season === season).sort((a, b) => a.round - b.round);
          return (
            <div key={season} className="flex items-start gap-3 border-b border-line/60 py-2 last:border-b-0">
              <span className="w-10 pt-0.5 text-xs font-semibold text-ink-3">{season}</span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {ps.length ? (
                  ps.map((p) => (
                    <span
                      key={p.assetId}
                      title={`${p.valueNote}${p.source === "implied" ? " Ownership implied (never traded)." : " Ownership confirmed by Sleeper traded_picks."}`}
                      className="tnum inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2 ring-1 ring-inset ring-line"
                    >
                      {p.label.replace(`${season} `, "")}
                      <span className="text-ink-3">{fmtInt(p.value)}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ink-3">No picks</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LineupList({ t, assignments }: { t: TeamAnalysis; assignments: { slot: string; playerId: string | null; score: number }[] }) {
  const byId = new Map(t.players.map((p) => [p.id, p]));
  return (
    <ul className="divide-y divide-line/60 px-4 pb-3 text-sm">
      {assignments.map((a, i) => {
        const p = a.playerId ? byId.get(a.playerId) : undefined;
        return (
          <li key={`${a.slot}-${i}`} className="flex items-center gap-3 py-1.5">
            <span className="w-10 text-[11px] font-medium text-ink-3">{a.slot.replace("SUPER_FLEX", "SF")}</span>
            <span className="flex-1 truncate text-ink">{p?.name ?? <span className="text-ink-3">Empty</span>}</span>
            <span className="text-[11px] text-ink-3">{p?.position}</span>
            <span className="tnum w-12 text-right text-ink-2">{fmtPts(a.score)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function LineupCard({ t }: { t: TeamAnalysis }) {
  const proj = t.projectedLineup;
  return (
    <Card>
      <CardHeader
        title="Lineups"
        subtitle={`Best possible: ${fmtPts(t.lineup.total)} adj. PPG (${fmtPts(t.injuryAdjustedLineupTotal)} without unavailable players)${proj ? ` · Projected week ${proj.week}: ${fmtPts(proj.total)} (${ordinal(proj.rank)})` : ""}`}
        info="Best possible: built from actual 2026 production (league scoring), filling the most restrictive slots first; adjusted PPG divides by at least 2 games. Projected: the best lineup by Sleeper's projections for this week, excluding players listed Out/IR."
      />
      {proj ? (
        <Tabs tabs={[{ key: "lineup-best", label: "From production" }, { key: "lineup-proj", label: `Projected wk ${proj.week}` }]} className="[&>[role=tablist]]:mx-4 [&>[role=tablist]]:mb-1">
          <LineupList t={t} assignments={t.lineup.assignments} />
          <LineupList t={t} assignments={proj.assignments} />
        </Tabs>
      ) : (
        <LineupList t={t} assignments={t.lineup.assignments} />
      )}
    </Card>
  );
}
