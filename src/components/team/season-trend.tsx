import { TrendLine, type TrendPoint } from "@/components/charts";
import { Card, CardHeader } from "@/components/ui";
import type { DailySnapshot } from "@/lib/snapshots/store";

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Playoff odds and roster value over time for one team, from the daily snapshots. */
export function SeasonTrendCard({ snaps, rosterId }: { snaps: DailySnapshot[]; rosterId: number }) {
  const mine = snaps.map((s) => ({ date: s.date, t: s.teams.find((x) => x.rosterId === rosterId) })).filter((x) => x.t);
  const odds: TrendPoint[] = mine.filter((x) => x.t!.playoffPct != null).map((x) => ({ label: day(x.date), value: x.t!.playoffPct! }));
  const value: TrendPoint[] = mine.map((x) => ({ label: day(x.date), value: x.t!.totalValue }));
  return (
    <Card>
      <CardHeader
        title="Season trend"
        subtitle={mine.length ? `Daily since ${day(mine[0].date)}` : "Starts collecting today"}
        info="The app saves each team's playoff odds, total asset value and power rank once a day. Lines fill in as days pass."
      />
      {mine.length < 2 ? (
        <p className="px-5 pb-5 text-sm text-ink-3">
          Collecting a daily history of your playoff odds, roster value and power rank. Check back tomorrow for the first trend line.
        </p>
      ) : (
        <div className="space-y-3 px-3 pb-4">
          {odds.length >= 2 && (
            <div>
              <div className="label-caps px-2">Playoff odds</div>
              <TrendLine data={odds} kind="percent" />
            </div>
          )}
          <div>
            <div className="label-caps px-2">Total asset value</div>
            <TrendLine data={value} kind="value" />
          </div>
        </div>
      )}
    </Card>
  );
}
