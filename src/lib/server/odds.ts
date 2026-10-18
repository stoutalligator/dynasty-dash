import type { LeagueModel } from "@/lib/analysis/types";
import { oddsDelta, type OddsDelta } from "@/lib/sim/context";
import type { TradeAsset } from "@/lib/trades/assets";
import type { TradeEvaluation } from "@/lib/trades/evaluate";
import type { ThreeTeamEvaluation } from "@/lib/trades/three-team";

const playerIds = (assets: TradeAsset[]) => assets.filter((a) => a.kind === "player").map((a) => a.assetId.slice("player:".length));

/** Title-odds weight in ranking, by objective (per percentage point of title odds). */
const TITLE_WEIGHT = { contender: 0.25, retool: 0.1, rebuild: 0 } as const;

/**
 * Attach playoff/title odds before → after for each side (season simulation with the rosters
 * swapped), and fold the title-odds change into the ranking for contending/retooling objectives.
 */
export function annotateTradeOdds(model: LeagueModel, evals: TradeEvaluation[], objective: keyof typeof TITLE_WEIGHT, limit = 40): TradeEvaluation[] {
  if (!model.odds) return evals;
  for (const e of evals.slice(0, limit)) {
    const d = oddsDelta(model, [
      { rosterId: e.mine.rosterId, out: playerIds(e.mine.gives), in: playerIds(e.mine.gets) },
      { rosterId: e.partner.rosterId, out: playerIds(e.partner.gives), in: playerIds(e.partner.gets) },
    ]);
    if (!d) continue;
    e.odds = { mine: d.get(e.mine.rosterId)!, partner: d.get(e.partner.rosterId)! };
    const titlePp = (e.odds.mine.titleAfter - e.odds.mine.titleBefore) * 100;
    e.overall = Math.round((e.overall + TITLE_WEIGHT[objective] * titlePp) * 100) / 100;
  }
  return evals.sort((a, b) => b.overall - a.overall);
}

export function annotateThreeTeamOdds(model: LeagueModel, evals: ThreeTeamEvaluation[]): ThreeTeamEvaluation[] {
  if (!model.odds) return evals;
  for (const e of evals) {
    const changes = e.sides.map((s) => ({ rosterId: s.rosterId, out: playerIds(s.gives), in: playerIds(s.gets) }));
    const d = oddsDelta(model, changes);
    if (d) e.odds = Object.fromEntries([...d.entries()].map(([k, v]) => [k, v])) as Record<number, OddsDelta>;
  }
  return evals;
}
