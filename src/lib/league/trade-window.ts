import type { LeagueInfo } from "./models";

export type TradeWindow =
  | { state: "open"; weeksLeft: number | null; deadline: number | null }
  | { state: "deadline-week"; weeksLeft: 0; deadline: number }
  | { state: "closed"; weeksLeft: null; deadline: number };

/**
 * Whether trades can be made right now. Sleeper allows trades through the deadline week, then
 * locks them until the season is over (trades reopen in the offseason). A deadline of 0 or none
 * means no deadline.
 */
export function tradeWindow(league: Pick<LeagueInfo, "status" | "currentWeek" | "tradeDeadline">): TradeWindow {
  const deadline = league.tradeDeadline && league.tradeDeadline > 0 ? league.tradeDeadline : null;
  const week = league.currentWeek;
  if (league.status !== "in_season" || deadline == null || week == null) return { state: "open", weeksLeft: null, deadline };
  if (week > deadline) return { state: "closed", weeksLeft: null, deadline };
  if (week === deadline) return { state: "deadline-week", weeksLeft: 0, deadline };
  return { state: "open", weeksLeft: deadline - week, deadline };
}

/** One-line description for banners and the digest, or null when there is nothing worth saying. */
export function tradeWindowNote(w: TradeWindow): string | null {
  if (w.state === "closed") return `The trade deadline (week ${w.deadline}) has passed. Trades reopen after the season; ideas here are for the offseason.`;
  if (w.state === "deadline-week") return `Last chance to trade: the deadline is week ${w.deadline}, and Sleeper locks trades when week ${w.deadline + 1} begins.`;
  if (w.weeksLeft != null && w.weeksLeft <= 3) return `Trade deadline in ${w.weeksLeft} week${w.weeksLeft > 1 ? "s" : ""} (week ${w.deadline}).`;
  return null;
}
