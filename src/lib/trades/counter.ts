import type { LeagueModel, Strategy } from "@/lib/analysis/types";
import { teamAssets, type TradeAsset } from "./assets";
import { evaluateTrade, type TradeEvaluation } from "./evaluate";

export type CounterOffer = {
  kind: "add-mine" | "remove-theirs" | "add-theirs" | "remove-mine";
  asset: TradeAsset;
  /** Plain-language change, e.g. "Add your 2028 2nd". */
  change: string;
  evaluation: TradeEvaluation;
};

const MIN_VALUE = 250;
const MAX_PER_SIDE = 4;

/**
 * Smallest one-piece changes that make a lopsided trade workable for both sides, scored with the
 * same evaluation as everything else. If the partner would likely decline, try adding one of my
 * assets or removing one of theirs; if it's bad for me, try adding one of theirs or removing one
 * of mine. Kept: changes after which I still gain and the partner is at least "Possible".
 */
export function suggestCounters(
  model: LeagueModel,
  args: { myRosterId: number; partnerRosterId: number; myGives: TradeAsset[]; theirGives: TradeAsset[]; objective: Strategy; untouchables?: string[] },
  limit = 3,
): CounterOffer[] {
  const me = model.teams.find((t) => t.team.rosterId === args.myRosterId);
  const them = model.teams.find((t) => t.team.rosterId === args.partnerRosterId);
  if (!me || !them) return [];
  const base = evaluateTrade(model, args);
  const untouchable = new Set(args.untouchables ?? []);
  const inDeal = new Set([...args.myGives, ...args.theirGives].map((a) => a.assetId));
  const ev = (myGives: TradeAsset[], theirGives: TradeAsset[]) => evaluateTrade(model, { ...args, myGives, theirGives });
  const out: CounterOffer[] = [];

  if (base.partner.score < 0) {
    for (const a of teamAssets(me)) {
      if (inDeal.has(a.assetId) || untouchable.has(a.assetId) || a.value < MIN_VALUE || args.myGives.length >= MAX_PER_SIDE) continue;
      out.push({ kind: "add-mine", asset: a, change: `Add your ${a.label}`, evaluation: ev([...args.myGives, a], args.theirGives) });
    }
    if (args.theirGives.length > 1) {
      for (const a of args.theirGives) out.push({ kind: "remove-theirs", asset: a, change: `Don't ask for ${a.label}`, evaluation: ev(args.myGives, args.theirGives.filter((x) => x !== a)) });
    }
    return out
      .filter((c) => c.evaluation.partner.score >= 0 && c.evaluation.mine.score > 0)
      .sort((a, b) => b.evaluation.mine.score - a.evaluation.mine.score)
      .slice(0, limit);
  }
  if (base.mine.score <= 0) {
    for (const a of teamAssets(them)) {
      if (inDeal.has(a.assetId) || a.value < MIN_VALUE || args.theirGives.length >= MAX_PER_SIDE) continue;
      out.push({ kind: "add-theirs", asset: a, change: `Also ask for ${a.label}`, evaluation: ev(args.myGives, [...args.theirGives, a]) });
    }
    if (args.myGives.length > 1) {
      for (const a of args.myGives) out.push({ kind: "remove-mine", asset: a, change: `Keep your ${a.label}`, evaluation: ev(args.myGives.filter((x) => x !== a), args.theirGives) });
    }
    return out
      .filter((c) => c.evaluation.mine.score > 0 && c.evaluation.partner.score >= -0.5)
      .sort((a, b) => b.evaluation.partner.score - a.evaluation.partner.score)
      .slice(0, limit);
  }
  return [];
}
