import type { Transaction } from "@/lib/league/models";
import type { PickupTier } from "./waivers";

/** Winning FAAB bids in this league (this season and past seasons), as a price reference. */
export type FaabMarket = {
  /** Winning bids, ascending. */
  bids: number[];
  /** Seasons the bids came from. */
  seasons: string[];
  /** Bid percentiles (25/50/75/90). */
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  max: number;
  /** The biggest winning bids, newest first among ties. */
  top: { amount: number; playerId: string; season: string; name?: string }[];
};

const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))] : 0);

/** Successful waiver claims with a positive bid. */
export function faabMarket(sources: { season: string; transactions: Transaction[] }[]): FaabMarket | null {
  const wins = sources.flatMap((s) =>
    s.transactions
      .filter((t) => t.type === "waiver" && t.status === "complete" && (t.waiverBid ?? 0) > 0)
      .map((t) => ({ amount: t.waiverBid!, playerId: t.adds[0]?.playerId ?? "", season: s.season, at: t.createdAt })),
  );
  if (wins.length < 5) return null;
  const bids = wins.map((w) => w.amount).sort((a, b) => a - b);
  return {
    bids,
    seasons: [...new Set(wins.map((w) => w.season))].sort(),
    p25: pct(bids, 0.25),
    p50: pct(bids, 0.5),
    p75: pct(bids, 0.75),
    p90: pct(bids, 0.9),
    max: bids[bids.length - 1],
    top: [...wins].sort((a, b) => b.amount - a.amount || b.at - a.at).slice(0, 5).map(({ amount, playerId, season }) => ({ amount, playerId, season })),
  };
}

/**
 * Suggested bid range for a pickup tier, from this league's own winning bids: strong adds go for
 * what the league's top quarter of claims cost, worth-a-look at the middle, stashes at the low
 * end. Capped at the FAAB you have left. A guide, not a prediction of others' bids.
 */
export function suggestedBid(market: FaabMarket, tier: PickupTier, remaining: number | null): { low: number; high: number } | null {
  const range =
    tier === "Strong add" ? [market.p75, market.p90] : tier === "Worth a look" ? [market.p50, market.p75] : tier === "Stash" ? [market.p25, market.p50] : null;
  if (!range) return null;
  const cap = remaining ?? Infinity;
  const low = Math.min(cap, Math.max(1, Math.round(range[0])));
  const high = Math.min(cap, Math.max(low, Math.round(range[1])));
  return { low, high };
}
