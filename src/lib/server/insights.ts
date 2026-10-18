import { recommendationsFor, type Recommendation } from "@/lib/analysis/recommendations";
import type { LeagueModel, Strategy } from "@/lib/analysis/types";
import type { TradeEvaluation } from "@/lib/trades/evaluate";
import { generateTrades } from "@/lib/trades/generate";
import type { Prefs } from "@/lib/prefs/store";

const tradeMemo = new WeakMap<LeagueModel, Map<string, TradeEvaluation[]>>();

/** Default trade ideas for my team per objective, memoized per model + preference lists. */
export function defaultTrades(model: LeagueModel, prefs: Prefs, objective: Strategy, limit = 12): TradeEvaluation[] {
  if (model.myRosterId == null) return [];
  let byKey = tradeMemo.get(model);
  if (!byKey) tradeMemo.set(model, (byKey = new Map()));
  const key = JSON.stringify([objective, limit, prefs.untouchables, prefs.tradeBlock, prefs.targets]);
  let out = byKey.get(key);
  if (!out) {
    out = generateTrades(model, model.myRosterId, {
      objective,
      limit,
      untouchables: prefs.untouchables,
      tradeBlock: prefs.tradeBlock,
      targets: prefs.targets,
    });
    byKey.set(key, out);
  }
  return out;
}

export function myRecommendations(model: LeagueModel, prefs: Prefs): Record<Strategy, Recommendation[]> | null {
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  if (!me) return null;
  return recommendationsFor(model, me, {
    contender: defaultTrades(model, prefs, "contender"),
    retool: defaultTrades(model, prefs, "retool"),
    rebuild: defaultTrades(model, prefs, "rebuild"),
  });
}
