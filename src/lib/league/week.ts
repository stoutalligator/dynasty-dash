import type { LeagueInfo } from "./models";

/**
 * The week that matters now. Sleeper scores a week overnight after Monday's games but only moves
 * its week counter on Wednesday; in between, the "current" week is already final, so matchups,
 * start/sit and projections should look at the next one.
 */
export function upcomingWeek(league: Pick<LeagueInfo, "currentWeek" | "lastScoredWeek" | "status">): number {
  const current = Math.max(1, league.currentWeek ?? (league.lastScoredWeek ?? 0) + 1);
  if (league.status === "in_season" && (league.lastScoredWeek ?? 0) >= current) return current + 1;
  return current;
}
