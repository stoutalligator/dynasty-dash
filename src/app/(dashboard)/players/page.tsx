import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { PlayersExplorer } from "@/components/players-explorer";
import { Card, CardHeader, PageTitle, SourceTag } from "@/components/ui";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Players" };

async function Players({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, { model }] = await Promise.all([searchParams, getLeague()]);
  const players = [...model.teams.flatMap((t) => t.players), ...model.freeAgents];
  const teams = model.teams.map((t) => ({ rosterId: t.team.rosterId, name: t.team.teamName }));
  return (
    <>
      <PageTitle title="Players" subtitle="Every rostered player and relevant free agent" />
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
        <PlayersExplorer players={players} teams={teams} valueLabel={model.valuation.label} myRosterId={model.myRosterId} initialQuery={typeof q === "string" ? q.slice(0, 60) : ""} />
      </Card>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <Players searchParams={searchParams} />
    </PageSuspense>
  );
}
