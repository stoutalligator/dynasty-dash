import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { TradeHub, type HubTeam, type SavedView } from "@/components/trades/trade-hub";
import { Notice, PageTitle } from "@/components/ui";
import type { TeamAnalysis } from "@/lib/analysis/types";
import { assetIndex, teamAssets } from "@/lib/trades/assets";
import { evaluateTrade } from "@/lib/trades/evaluate";
import { generateTrades } from "@/lib/trades/generate";
import { getLeague, myTeam } from "@/lib/server/data";
import { defaultTrades } from "@/lib/server/insights";
import { annotateTradeOdds } from "@/lib/server/odds";

export const metadata: Metadata = { title: "Trade Hub" };

const hubTeam = (t: TeamAnalysis): HubTeam => ({
  rosterId: t.team.rosterId,
  name: t.team.teamName,
  strategy: t.strategy.effective,
  needs: t.needs.map((n) => n.position),
  assets: teamAssets(t),
});

async function Hub({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const [{ partner }, { model, prefs }] = await Promise.all([searchParams, getLeague()]);
  const me = myTeam(model);
  if (!me) return <Notice level="error">Your team could not be verified, so trades cannot be generated. Check Settings.</Notice>;

  const objective = me.strategy.effective;
  const partnerId = partner && model.teams.some((t) => t.team.rosterId === Number(partner) && !t.team.isMine) ? Number(partner) : null;
  const proposals = partnerId
    ? annotateTradeOdds(model, generateTrades(model, me.team.rosterId, { objective, partnerRosterIds: [partnerId], perPartner: 15, limit: 40, untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets }), objective)
    : defaultTrades(model, prefs, objective, 30);

  // Saved proposals are re-evaluated against today's rosters; anything no longer owned is flagged.
  const idx = assetIndex(model);
  const saved: SavedView[] = prefs.savedProposals.map((s) => {
    const mine = s.myAssets.map((id) => idx.get(id));
    const theirs = s.theirAssets.map((id) => idx.get(id));
    const moved = [...mine.map((a, i) => (!a || a.rosterId !== me.team.rosterId ? s.myAssets[i] : null)), ...theirs.map((a, i) => (!a || a.rosterId !== s.partnerRosterId ? s.theirAssets[i] : null))].filter(Boolean);
    if (moved.length) return { ...s, evaluation: null, problem: `No longer valid: ${moved.length} asset(s) have changed teams since this was saved.` };
    return {
      ...s,
      problem: null,
      evaluation: annotateTradeOdds(model, [evaluateTrade(model, { myRosterId: me.team.rosterId, partnerRosterId: s.partnerRosterId, myGives: mine.map((a) => a!), theirGives: theirs.map((a) => a!), objective })], objective)[0],
    };
  });

  return (
    <>
      <PageTitle
        title="Trade Hub"
        subtitle="Two-team trade ideas grounded in every roster, each team's needs and window, and both sides' lineup impact"
      />
      {model.valuation.kind === "internal-estimate" && (
        <div className="mb-4">
          <Notice level="warning">No third-party valuation source is active, so trade values are internal estimates from production and age. Treat rankings as approximate.</Notice>
        </div>
      )}
      <TradeHub
        me={hubTeam(me)}
        partners={model.teams.filter((t) => !t.team.isMine).map(hubTeam)}
        initialProposals={proposals}
        initialObjective={objective}
        initialPartner={partnerId}
        flags={{ untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets }}
        saved={saved}
        valueLabel={`${model.valuation.label} (${model.valuation.kind === "third-party" ? "third-party market values" : "internal estimate"})`}
      />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Hub searchParams={searchParams} />
    </Suspense>
  );
}
