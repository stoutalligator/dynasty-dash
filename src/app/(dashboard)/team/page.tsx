import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Recommendations } from "@/components/team/recommendations";
import { TeamView } from "@/components/team/team-view";
import { Card, CardHeader } from "@/components/ui";
import { getLeague, myTeam } from "@/lib/server/data";
import { GuestBanner, TeamDirectory } from "@/components/league/guest-overview";
import { myRecommendations } from "@/lib/server/insights";

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
  return (
    <TeamView
      t={t}
      model={model}
      extra={
        recs && (
          <Card className="mt-5">
            <CardHeader
              title="Recommended actions"
              subtitle="Three paths for your team; ● marks the one we recommend"
            />
            <Recommendations recs={recs} recommended={t.strategy.effective} />
          </Card>
        )
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
