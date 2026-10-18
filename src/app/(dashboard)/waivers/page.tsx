import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerAvatar } from "@/components/avatar";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardHeader, InfoTip, Notice, PageTitle, PosBadge, SourceTag, StatTile } from "@/components/ui";
import { TierBadge, WaiverExplorer } from "@/components/waivers/waiver-explorer";
import { PICKUP_WEIGHTS, buildWaiverBoard } from "@/lib/analysis/waivers";
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

      <Card className="mt-5">
        <CardHeader
          title="Sleepers on the wire"
          subtitle="Ranked by pickup score; usage and production are real NFL stats scored with your league settings"
          action={
            <InfoTip
              text={`Pickup score (0–100) = production ${w.production * 100}% (recent PPG vs. your league's replacement level) + opportunity ${w.opportunity * 100}% (snap share and targets/carries) + projection ${w.projection * 100}% + snap-share trend ${w.trend * 100}% + upside ${w.upside * 100}% (dynasty value or youth) + market ${w.market * 100}% (Sleeper adds). Tiers: Strong add ≥ 60 and producing at replacement level; Worth a look ≥ 45; Stash = young or valued upside.`}
            />
          }
        />
        <WaiverExplorer candidates={board.candidates} projectionWeek={projWeek} />
        <p className="px-4 pb-4 text-[11px] text-ink-3">
          Sources: weekly stats and projections from Sleeper&apos;s public stats feed (undocumented), trending adds from Sleeper, dynasty values from {model.valuation.label}. Stats cover completed weeks; projections are Sleeper&apos;s, not ours.
        </p>
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Waivers />
    </Suspense>
  );
}
