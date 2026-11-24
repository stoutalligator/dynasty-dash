import type { Metadata } from "next";
import { PlayerAvatar } from "@/components/avatar";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardHeader, InfoTip, Notice, PageTitle, PosBadge, SourceTag, StatTile } from "@/components/ui";
import { TierBadge, WaiverExplorer } from "@/components/waivers/waiver-explorer";
import { PICKUP_WEIGHTS, buildWaiverBoard } from "@/lib/analysis/waivers";
import { suggestedBid, type FaabMarket } from "@/lib/analysis/faab";
import { fmtInt, fmtPts } from "@/lib/format";
import { getLeague, myTeam } from "@/lib/server/data";

export const metadata: Metadata = { title: "Waiver Wire" };

const WAIVER_TYPE: Record<number, string> = { 0: "Rolling", 1: "Reverse standings", 2: "FAAB" };

async function Waivers() {
  const { model } = await getLeague();
  const me = myTeam(model);
  const board = buildWaiverBoard(model, me, model.league.waiverBudget);
  const fits = board.candidates.filter((c) => (c.lineupGain > 0.05 || c.fillsNeed) && c.tier !== "Monitor").slice(0, 4);
  const trendingHere = board.candidates.filter((c) => c.player.trendingAdds).sort((a, b) => (b.player.trendingAdds ?? 0) - (a.player.trendingAdds ?? 0)).slice(0, 6);
  const projWeek = model.projectionWeeks[0] ?? null;
  const w = PICKUP_WEIGHTS;
  // Suggested FAAB bids from this league's own winning bids, per pickup tier.
  const market = model.faab;
  const bids: Record<string, { low: number; high: number }> = {};
  if (market && board.faab) {
    for (const c of board.candidates) {
      const b = suggestedBid(market, c.tier, board.faab.remaining);
      if (b) bids[c.player.id] = b;
    }
  }

  return (
    <>
      <PageTitle
        title="Waiver wire"
        subtitle={`Every unrostered QB/RB/WR/TE in ${model.league.name}, scored with your league's settings`}
      />
      {model.statsSource !== "stats" && (
        <div className="mb-4">
          <Notice level="warning">The weekly NFL stats feed is unavailable, so free-agent production and snap shares are missing. Rankings rely on projections, values and trends only.</Notice>
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Free agents tracked" value={board.candidates.length} sub={`${board.candidates.filter((c) => c.tier === "Strong add" || c.tier === "Worth a look").length} worth a look or better`} />
        <StatTile label="Waiver type" value={model.league.waiverType != null ? (WAIVER_TYPE[model.league.waiverType] ?? "—") : "—"} sub={board.waiverPosition != null ? `Your waiver position: ${board.waiverPosition}` : undefined} />
        <StatTile label="FAAB remaining" value={board.faab ? `$${board.faab.remaining}` : "—"} sub={board.faab ? `of $${board.faab.budget} · $${board.faab.used} spent` : "League doesn't use FAAB"} tone="accent" />
        <StatTile label="Production through" value={`Week ${model.league.lastScoredWeek ?? "—"}`} sub={projWeek ? `Projections: weeks ${model.projectionWeeks.join(", ")}` : "No projections loaded"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Best fits for your roster" subtitle="Would enter your best lineup or plays a position you need" />
          {fits.length ? (
            <ul className="divide-y divide-line/60 px-4 pb-2">
              {fits.map((c) => (
                <li key={c.player.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <PlayerAvatar id={c.player.id} name={c.player.name} size={26} />
                  <PosBadge pos={c.player.position} />
                  <span className="min-w-0 flex-1 truncate text-ink">{c.player.name}</span>
                  <span className="tnum text-xs text-accent">{c.lineupGain > 0.05 ? `+${fmtPts(c.lineupGain)}` : "need"}</span>
                  {bids[c.player.id] && <span className="tnum text-[11px] text-ink-3">${bids[c.player.id].low}–{bids[c.player.id].high}</span>}
                  <TierBadge tier={c.tier} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-ink-3">No free agent would currently improve your best lineup.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Drop candidates" subtitle="Your bench players with no lineup impact and the least value" info="Lowest dynasty value first among bench players outside your best lineup. Taxi and IR players are excluded because they don't use active roster spots." />
          {board.dropCandidates.length ? (
            <ul className="divide-y divide-line/60 px-4 pb-2">
              {board.dropCandidates.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <PosBadge pos={p.position} />
                  <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                  <span className="tnum text-xs text-ink-3">{p.prod?.activeWeeks ? `${fmtPts(p.prod.ppg)} ppg` : "no pts"} · {p.value != null ? fmtInt(p.value) : "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-ink-3">No obvious drop candidates.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Trending on Sleeper and available here" subtitle="Most-added players across all Sleeper leagues (48h)" action={<SourceTag kind="sleeper" label="Sleeper trending" />} />
          {trendingHere.length ? (
            <ul className="divide-y divide-line/60 px-4 pb-2">
              {trendingHere.map((c) => (
                <li key={c.player.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <PosBadge pos={c.player.position} />
                  <span className="min-w-0 flex-1 truncate text-ink">{c.player.name}</span>
                  <span className="tnum text-xs text-ink-3">{fmtInt(c.player.trendingAdds)} adds</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-ink-3">None of this week&apos;s most-added players are available in your league.</p>
          )}
        </Card>
      </div>

      {market && board.faab && (
        <Card className="mt-5">
          <CardHeader
            title="What bids win here"
            subtitle={`${market.bids.length} winning FAAB bids in this league (${market.seasons.join(", ")}) · suggested bids on each player below come from these`}
            info="Strong adds are priced at what the top quarter of this league's winning claims cost (75th–90th percentile), Worth a look at the middle (50th–75th), Stash at the low end (25th–50th). Capped at your remaining FAAB. Other managers' budgets and needs vary, so treat these as a guide."
          />
          <div className="grid gap-5 px-4 pb-5 sm:px-5 lg:grid-cols-[1fr_auto]">
            <div>
              <BidDistribution market={market} budget={board.faab.budget} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([["Typical", market.p50], ["Top quarter", market.p75], ["Top 10%", market.p90], ["Record", market.max]] as const).map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-line bg-surface-2/50 px-3 py-2">
                    <div className="label-caps">{l}</div>
                    <div className="tnum text-lg font-semibold text-ink">${v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-56">
              <div className="label-caps mb-1.5">Biggest winning bids</div>
              <ul className="space-y-1 text-sm">
                {market.top.map((b, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{b.name ?? model.playerNames[b.playerId]?.name ?? "Unknown player"} <span className="text-ink-3">· {b.season}</span></span>
                    <span className="tnum font-semibold text-ink">${b.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader
          title="Sleepers on the wire"
          subtitle="Free agents ranked for your roster, scored with your league settings"
          action={
            <InfoTip
              text={`Pickup score (0–100) = production ${w.production * 100}% (recent PPG vs. your league's replacement level) + opportunity ${w.opportunity * 100}% (snap share and targets/carries) + projection ${w.projection * 100}% + snap-share trend ${w.trend * 100}% + upside ${w.upside * 100}% (dynasty value or youth) + market ${w.market * 100}% (Sleeper adds). Tiers: Strong add ≥ 60 and producing at replacement level; Worth a look ≥ 45; Stash = young or valued upside.`}
            />
          }
        />
        <WaiverExplorer candidates={board.candidates} projectionWeek={projWeek} bids={bids} />
        <p className="px-4 pb-4 text-[11px] text-ink-3">
          Sources: weekly stats and projections from Sleeper&apos;s public stats feed (undocumented), trending adds from Sleeper, dynasty values from {model.valuation.label}. Stats cover completed weeks; projections are Sleeper&apos;s, not ours.
        </p>
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <PageSuspense fallback={<PageSkeleton />}>
      <Waivers />
    </PageSuspense>
  );
}

/** Histogram of winning bids (as a share of the budget), one hue; hairline baseline. */
function BidDistribution({ market, budget }: { market: FaabMarket; budget: number }) {
  const edges = [1, 2, 5, 10, 20, 35, 50, 75, 100, Infinity];
  const labels = ["$1", "$2–4", "$5–9", "$10–19", "$20–34", "$35–49", "$50–74", "$75–99", "$100+"];
  const counts = labels.map((_, i) => market.bids.filter((b) => b >= edges[i] && b < edges[i + 1]).length);
  const max = Math.max(1, ...counts);
  return (
    <div>
      <div className="flex h-28 items-end gap-1.5 border-b border-line" role="img" aria-label={`Winning bid distribution: ${labels.map((l, i) => `${l} ${counts[i]}`).join(", ")}`}>
        {counts.map((c, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
            <div className="animate-grow-y w-full max-w-6 rounded-t-[4px] bg-series-1/80 transition-colors group-hover:bg-series-1" style={{ height: `${Math.max(c ? 4 : 0, (c / max) * 100)}%` }} />
            <span className="pointer-events-none absolute -top-5 hidden text-[10px] font-semibold text-ink group-hover:block">{c}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {labels.map((l) => (
          <span key={l} className="flex-1 text-center text-[9.5px] text-ink-3">{l}</span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">Budget ${budget} per season.</p>
    </div>
  );
}
