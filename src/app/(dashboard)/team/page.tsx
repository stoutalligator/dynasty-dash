import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Recommendations } from "@/components/team/recommendations";
import { TeamView } from "@/components/team/team-view";
import { Card, CardHeader } from "@/components/ui";
import { getLeague, myTeam } from "@/lib/server/data";
import { GuestBanner, TeamDirectory } from "@/components/league/guest-overview";
import { myRecommendations } from "@/lib/server/insights";
import { SeasonTrendCard } from "@/components/team/season-trend";
import { TrendsCard } from "@/components/team/trends-card";
import { readSnapshots } from "@/lib/snapshots/store";

export const metadata: Metadata = { title: "My Team" };

async function MyTeam() {
  const { model, prefs } = await getLeague();
  const t = myTeam(model);
  if (!t) {
    return (
      <>
        <GuestBanner model={model}>You&apos;re not on a team in this league, so there&apos;s no &ldquo;My Team&rdquo; here. Pick any team to see its full profile.</GuestBanner>
        <TeamDirectory model={model} />
      </>
    );
  }
  const recs = myRecommendations(model, prefs);
  const snaps = await readSnapshots(model.league.id);
  return (
    <TeamView
      t={t}
      model={model}
      extra={
        <>
          {recs && (
            <Card className="mt-5">
              <CardHeader title="Recommended actions" subtitle="Three paths for your team; ● marks the one we recommend" />
              <Recommendations recs={recs} recommended={t.strategy.effective} />
            </Card>
          )}
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <TrendsCard model={model} t={t} />
            <SeasonTrendCard snaps={snaps} rosterId={t.team.rosterId} />
          </div>
        </>
      }
    />
  );
}

export default function Page() {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={6} />}>
      <MyTeam />
    </PageSuspense>
  );
}
