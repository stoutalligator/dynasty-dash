import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PlayersExplorer } from "@/components/players-explorer";
import { Card, CardHeader, PageTitle, SourceTag } from "@/components/ui";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Players" };

async function Players() {
  const { model } = await getLeague();
  const players = [...model.teams.flatMap((t) => t.players), ...model.freeAgents];
  const teams = model.teams.map((t) => ({ rosterId: t.team.rosterId, name: t.team.teamName }));
  return (
    <>
      <PageTitle title="Players" subtitle="Every rostered player plus every free agent with production, a projection, a dynasty value or Sleeper add activity" />
      <Card>
        <CardHeader
          title={`${players.length} players`}
          subtitle={
            `${model.freeAgents.length} free agents included · stats scored with your league settings`
          }
          action={
            <span className="flex gap-1.5">
              <SourceTag kind="sleeper" label="Stats: Sleeper" />
              <SourceTag kind={model.valuation.kind} label={`Value: ${model.valuation.label}`} />
            </span>
          }
        />
        <PlayersExplorer players={players} teams={teams} valueLabel={model.valuation.label} myRosterId={model.myRosterId} />
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Players />
    </Suspense>
  );
}
