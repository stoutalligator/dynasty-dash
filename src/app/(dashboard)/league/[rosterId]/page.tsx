import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { TeamView } from "@/components/team/team-view";
import { getLeague } from "@/lib/server/data";

async function TeamProfile({ params }: { params: Promise<{ rosterId: string }> }) {
  const { rosterId } = await params;
  const { model } = await getLeague();
  const t = model.teams.find((x) => x.team.rosterId === Number(rosterId));
  if (!t) notFound();
  return <TeamView t={t} model={model} />;
}

export default function Page({ params }: { params: Promise<{ rosterId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton tiles={6} />}>
      <TeamProfile params={params} />
    </Suspense>
  );
}
