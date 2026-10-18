import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Recommendations } from "@/components/team/recommendations";
import { TeamView } from "@/components/team/team-view";
import { Card, CardHeader, Notice } from "@/components/ui";
import { getLeague, myTeam } from "@/lib/server/data";
import { myRecommendations } from "@/lib/server/insights";

export const metadata: Metadata = { title: "My Team" };

async function MyTeam() {
  const { model, prefs } = await getLeague();
  const t = myTeam(model);
  if (!t) {
    return (
      <Notice level="error">
        Your team could not be verified against the live league. {model.verification.notes.join(" ")} Set <code>MY_ROSTER_ID</code> or{" "}
        <code>EXPECTED_TEAM_NAME</code> in <code>.env</code>.
      </Notice>
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
              subtitle="Three strategic scenarios; ● marks the one the model recommends. Switch the strategy above to override it."
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
    <Suspense fallback={<PageSkeleton tiles={6} />}>
      <MyTeam />
    </Suspense>
  );
}
