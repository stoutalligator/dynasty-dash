import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { TradeCalculator, type CalcTeam } from "@/components/trades/trade-calculator";
import { PageTitle } from "@/components/ui";
import { teamAssets } from "@/lib/trades/assets";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Trade Calculator" };

type Search = { a?: string; b?: string; ag?: string; bg?: string };

async function Calculator({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, { model }] = await Promise.all([searchParams, getLeague()]);
  const teams: CalcTeam[] = model.teams
    .map((t) => ({
      rosterId: t.team.rosterId,
      name: t.team.teamName,
      avatarUrl: t.team.avatarUrl,
      strategy: t.strategy.effective,
      isMine: t.team.isMine,
      assets: teamAssets(t),
    }))
    .sort((x, y) => Number(y.isMine) - Number(x.isMine) || x.name.localeCompare(y.name));

  // Restore a shared link (?a=1&b=4&ag=player:123,pick:...); anything that has since moved teams is dropped.
  const has = (rid: number) => teams.some((t) => t.rosterId === rid);
  const a = sp.a && has(Number(sp.a)) ? Number(sp.a) : teams[0].rosterId;
  const bDefault = teams.find((t) => t.rosterId !== a)!.rosterId;
  const b = sp.b && has(Number(sp.b)) && Number(sp.b) !== a ? Number(sp.b) : bDefault;
  const owned = (rid: number, list?: string) => {
    const ids = new Set(teams.find((t) => t.rosterId === rid)!.assets.map((x) => x.assetId));
    return (list ?? "").split(",").filter((id) => ids.has(id)).slice(0, 8);
  };

  return (
    <>
      <PageTitle title="Trade Calculator" subtitle={`Grade any trade between two teams in ${model.league.name}. Values from ${model.valuation.label}, judged against each team's roster and goals.`} />
      <TradeCalculator teams={teams} initial={{ a, b, ag: owned(a, sp.ag), bg: owned(b, sp.bg) }} />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <Calculator searchParams={searchParams} />
    </PageSuspense>
  );
}
