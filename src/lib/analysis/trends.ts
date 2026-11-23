import type { PlayerProduction } from "./production";

export type TrendKind = "rising-role" | "hot-streak" | "shrinking-role" | "cold-streak";
export type PlayerTrend = {
  kind: TrendKind;
  recentPpg: number;
  earlierPpg: number;
  /** Change in snap share (0–1) and in targets+carries per game, last 3 vs. earlier games. */
  snapDelta: number | null;
  oppDelta: number | null;
  note: string;
};

export const TREND_LABEL: Record<TrendKind, string> = {
  "rising-role": "Rising role",
  "hot-streak": "Hot streak",
  "shrinking-role": "Shrinking role",
  "cold-streak": "Cold streak",
};

const MIN_GAMES = 5;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Compare a player's last three games with his earlier ones. A role change needs both production
 * and usage (snap share or targets+carries) to move: those tend to stick. Production moving
 * without usage is labeled a streak, which is more likely to fade.
 */
export function detectTrend(p: PlayerProduction | undefined): PlayerTrend | null {
  const games = (p?.weekly ?? []).filter((w) => w.played).sort((a, b) => a.week - b.week);
  if (games.length < MIN_GAMES) return null;
  const recent = games.slice(-3);
  const earlier = games.slice(0, -3);
  const recentPpg = avg(recent.map((g) => g.points));
  const earlierPpg = avg(earlier.map((g) => g.points));
  const delta = recentPpg - earlierPpg;
  const snaps = (gs: typeof games) => gs.map((g) => g.snapShare).filter((s): s is number => s != null);
  const opps = (gs: typeof games) => gs.map((g) => g.opportunities).filter((o): o is number => o != null);
  const snapDelta = snaps(recent).length && snaps(earlier).length ? avg(snaps(recent)) - avg(snaps(earlier)) : null;
  const earlierOpp = opps(earlier).length ? avg(opps(earlier)) : null;
  const oppDelta = opps(recent).length && earlierOpp != null ? avg(opps(recent)) - earlierOpp : null;
  // Usage must point one way: one measure clearly moves and the other doesn't move against it.
  const oppStep = Math.max(2, 0.25 * (earlierOpp ?? 0));
  const snapUp = (snapDelta ?? 0) >= 0.1, snapDown = (snapDelta ?? 0) <= -0.1;
  const oppUp = (oppDelta ?? 0) >= oppStep, oppDown = (oppDelta ?? 0) <= -oppStep;
  const snapAgainstUp = (snapDelta ?? 0) <= -0.05, snapAgainstDown = (snapDelta ?? 0) >= 0.05;
  const oppAgainstUp = (oppDelta ?? 0) <= -1, oppAgainstDown = (oppDelta ?? 0) >= 1;
  const usageUp = (snapUp || oppUp) && !snapAgainstUp && !oppAgainstUp;
  const usageDown = (snapDown || oppDown) && !snapAgainstDown && !oppAgainstDown;
  const usageText = [
    snapDelta != null && Math.abs(snapDelta) >= 0.05 ? `snap share ${snapDelta > 0 ? "+" : "−"}${Math.round(Math.abs(snapDelta) * 100)} pts` : null,
    oppDelta != null && Math.abs(oppDelta) >= 1 ? `${oppDelta > 0 ? "+" : "−"}${r1(Math.abs(oppDelta))} targets+carries/g` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const base = { recentPpg: r1(recentPpg), earlierPpg: r1(earlierPpg), snapDelta: snapDelta == null ? null : Math.round(snapDelta * 100) / 100, oppDelta: oppDelta == null ? null : r1(oppDelta) };
  const scoring = `${r1(recentPpg)} PPG over the last 3 vs ${r1(earlierPpg)} before`;
  if (delta >= Math.max(3, 0.25 * earlierPpg) && usageUp) return { kind: "rising-role", ...base, note: `${scoring}; usage up (${usageText}).` };
  if (delta <= -Math.max(3, 0.25 * earlierPpg) && usageDown) return { kind: "shrinking-role", ...base, note: `${scoring}; usage down (${usageText}).` };
  if (delta >= Math.max(4, 0.35 * earlierPpg)) return { kind: "hot-streak", ...base, note: `${scoring} without a clear rise in usage, so it may not last.` };
  if (delta <= -Math.max(4, 0.35 * earlierPpg)) return { kind: "cold-streak", ...base, note: `${scoring} without a clear drop in usage, so it may bounce back.` };
  return null;
}
