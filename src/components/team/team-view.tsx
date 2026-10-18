import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader, SourceTag } from "@/components/ui";
import type { LeagueModel, TeamAnalysis } from "@/lib/analysis/types";
import { LineupCard, NeedsCard, PicksCard, PositionGradesCard, StrategyCard, TeamHeader, TeamStatTiles } from "./team-panels";
import { RosterTable } from "./roster-table";

/** Full team profile, shared by My Team and every league team page. */
export function TeamView({ t, model, extra }: { t: TeamAnalysis; model: LeagueModel; extra?: ReactNode }) {
  return (
    <>
      <TeamHeader t={t} n={model.teams.length} />
      <TeamStatTiles t={t} model={model} />
      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <StrategyCard t={t} editable />
        <PositionGradesCard t={t} model={model} />
        <LineupCard t={t} />
      </div>
      {extra}
      <Card className="mt-5">
        <CardHeader
          title="Roster"
          subtitle={`${t.players.length} players · production from ${model.scoredWeeks} completed week${model.scoredWeeks === 1 ? "" : "s"}`}
          action={
            <span className="flex flex-wrap justify-end gap-1.5">
              <SourceTag kind="sleeper" label="Stats: Sleeper" />
              <SourceTag kind={model.valuation.kind} label={`Value: ${model.valuation.label}`} />
            </span>
          }
        />
        <RosterTable players={t.players} startingSlots={model.league.startingSlots} valueLabel={model.valuation.label} />
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <NeedsCard t={t} model={model} />
        <PicksCard t={t} model={model} />
      </div>
      {!t.team.isMine && (
        <div className="mt-5 text-sm">
          <Link href={`/trades?partner=${t.team.rosterId}`} className="text-accent hover:underline">
            Find trades with {t.team.teamName} →
          </Link>
        </div>
      )}
    </>
  );
}
