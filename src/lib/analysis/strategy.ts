import type { Strategy } from "@/lib/prefs/store";
import type { Confidence } from "./types";

/**
 * Transparent strategy classification. Inputs are percentiles (0–1, 1 = best in league).
 * "now" blends lineup strength with results so a team is never classified by record alone.
 */
export type StrategyInputs = {
  lineupPct: number;
  pointsForPct: number;
  potentialPct: number | null;
  winPct: number;
  youthPct: number;
  youngValuePct: number;
  capitalPct: number;
  totalValuePct: number;
  scoredWeeks: number;
  valuationIsEstimate: boolean;
};

/**
 * Calibrated on this league's 2024–25 seasons (Analytics → Model check): points for and record
 * after week 6 predicted final standings better than lineup potential alone, so they carry more
 * weight than the original 45/20/15/20 split.
 */
export const NOW_WEIGHTS = { lineup: 0.35, pointsFor: 0.3, potential: 0.1, win: 0.25 } as const;
export const FUTURE_WEIGHTS = { youth: 0.35, youngValue: 0.35, capital: 0.3 } as const;
export const CONTENDER_AT = 0.62;
export const REBUILD_AT = 0.38;

export function nowScore(i: StrategyInputs): number {
  const potential = i.potentialPct ?? i.lineupPct;
  return (
    NOW_WEIGHTS.lineup * i.lineupPct +
    NOW_WEIGHTS.pointsFor * i.pointsForPct +
    NOW_WEIGHTS.potential * potential +
    NOW_WEIGHTS.win * i.winPct
  );
}

export function futureScore(i: StrategyInputs): number {
  return FUTURE_WEIGHTS.youth * i.youthPct + FUTURE_WEIGHTS.youngValue * i.youngValuePct + FUTURE_WEIGHTS.capital * i.capitalPct;
}

export function classify(i: StrategyInputs): { strategy: Strategy; confidence: Confidence; now: number; future: number } {
  const now = nowScore(i);
  const future = futureScore(i);
  let strategy: Strategy = now >= CONTENDER_AT ? "contender" : now <= REBUILD_AT ? "rebuild" : "retool";
  // A middling team with an old roster and little future capital is closer to a seller.
  if (strategy === "retool" && now < 0.5 && future < 0.3) strategy = "rebuild";

  const margin = strategy === "contender" ? now - CONTENDER_AT : strategy === "rebuild" ? REBUILD_AT - now : Math.min(now - REBUILD_AT, CONTENDER_AT - now);
  const levels: Confidence[] = ["low", "medium", "high"];
  let level = margin >= 0.12 ? 2 : margin >= 0.05 ? 1 : 0;
  if (i.scoredWeeks < 4) level = Math.max(0, level - 1);
  return { strategy, confidence: levels[level], now, future };
}

export const STRATEGY_LABEL: Record<Strategy, string> = {
  contender: "Contender",
  retool: "Retool",
  rebuild: "Rebuilder",
};
