import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { TradeHub, type HubTeam, type SavedView } from "@/components/trades/trade-hub";
import { Notice, PageTitle } from "@/components/ui";
import type { TeamAnalysis } from "@/lib/analysis/types";
import { assetIndex, teamAssets } from "@/lib/trades/assets";
import { evaluateTrade } from "@/lib/trades/evaluate";
import { tradeWindow, tradeWindowNote } from "@/lib/league/trade-window";
import { GuestBanner, TeamDirectory } from "@/components/league/guest-overview";
import { generateTrades, locateAnchor } from "@/lib/trades/generate";
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

async function Hub({ searchParams }: { searchParams: Promise<{ partner?: string; asset?: string }> }) {
  const [{ partner, asset }, { model, prefs }] = await Promise.all([searchParams, getLeague()]);
  const me = myTeam(model);
  if (!me) {
    return (
      <>
        <GuestBanner model={model}>Trade ideas are built around your own roster. Sign in with your Sleeper username to see trades for your team.</GuestBanner>
        <TeamDirectory model={model} />
      </>
    );
  }

  const objective = me.strategy.effective;
  const tw = tradeWindow(model.league);
  const windowNote = tradeWindowNote(tw);
  const partnerId = partner && model.teams.some((t) => t.team.rosterId === Number(partner) && !t.team.isMine) ? Number(partner) : null;
  // ?asset=player:<id> builds every idea around one player (mine to shop, or theirs to acquire).
  const where = asset && /^(player|pick):[\w:.-]+$/.test(asset) ? locateAnchor(model, me.team.rosterId, asset) : null;
  const anchor = where ? asset! : null;
  const proposals = anchor
    ? annotateTradeOdds(
        model,
        generateTrades(model, me.team.rosterId, { objective, anchorAssetId: anchor, perPartner: where!.side === "theirs" ? 15 : 4, limit: 40, untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets }),
        objective,
      )
    : partnerId
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
        subtitle="Fair trades that help you and make sense for the other team"
      />
      {windowNote && (
        <div className="mb-4">
          <Notice level={tw.state === "open" ? "info" : "warning"}>{windowNote}</Notice>
        </div>
      )}
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
        initialAnchor={anchor}
        flags={{ untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets }}
        saved={saved}
        valueLabel={`${model.valuation.label} (${model.valuation.kind === "third-party" ? "third-party market values" : "internal estimate"})`}
      />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ partner?: string; asset?: string }> }) {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <Hub searchParams={searchParams} />
    </PageSuspense>
  );
}
