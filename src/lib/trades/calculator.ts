import type { LeagueModel } from "@/lib/analysis/types";
import { packageValue, teamAssets, type TradeAsset } from "./assets";
import type { SideImpact, TradeEvaluation } from "./evaluate";

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";

/** Grade bands on a side's composite score (percent of the bigger package, plus team fit). */
const BANDS: [number, Grade][] = [
  [15, "A+"], [9, "A"], [4, "A-"], [1.5, "B+"], [-1.5, "B"], [-4, "B-"], [-7, "C+"], [-11, "C"], [-16, "C-"], [-25, "D"],
];

/**
 * A side's composite: value gained as a percent of the bigger package, nudged by how well the deal
 * fits that team (lineup change, needs filled, roster cuts), capped so fit can't hide a lopsided deal.
 */
export function sideComposite(s: SideImpact): number {
  const bigger = Math.max(s.valueIn, s.valueOut, 1);
  const valuePct = (s.netValue / bigger) * 100;
  const fit = Math.max(-3, Math.min(3, s.score - s.netValue / 1000));
  return Math.round((valuePct + 2 * fit) * 10) / 10;
}

export function gradeFor(composite: number): Grade {
  for (const [min, g] of BANDS) if (composite >= min) return g;
  return "F";
}

export type Verdict = { tone: "even" | "a" | "b"; headline: string; detail: string };

/** One plain sentence about who wins, in value terms, from side A's point of view. */
export function verdict(ev: TradeEvaluation): Verdict {
  const gap = ev.mine.valueIn - ev.mine.valueOut;
  const pct = Math.abs(ev.valueBalance) * 100;
  if (!ev.mine.gives.length || !ev.mine.gets.length) return { tone: "even", headline: "Add players or picks to both sides", detail: "" };
  if (pct < 5) return { tone: "even", headline: "Fair trade", detail: `Within ${Math.abs(gap).toLocaleString()} in value (${pct.toFixed(0)}%). Either side could say yes.` };
  const winner = gap > 0 ? ev.mine : ev.partner;
  const size = pct < 12 ? "a little" : pct < 25 ? "clearly" : "by a lot";
  return {
    tone: gap > 0 ? "a" : "b",
    headline: `${winner.teamName} wins ${size}`,
    detail: `${Math.abs(gap).toLocaleString()} more value (${pct.toFixed(0)}% of the bigger side).`,
  };
}

export type Balancer = { fromRosterId: number; teamName: string; asset: TradeAsset; newBalance: number };

/**
 * The single extra asset from the side that's ahead that brings the deal closest to even. Only
 * suggested when the gap is meaningful (5%+) and an asset actually narrows it.
 */
export function balancer(model: LeagueModel, ev: TradeEvaluation): Balancer | null {
  if (!ev.mine.gives.length || !ev.mine.gets.length || Math.abs(ev.valueBalance) < 0.05) return null;
  // The side receiving more value adds something to what it gives.
  const ahead = ev.mine.netValue > 0 ? ev.mine : ev.partner;
  const team = model.teams.find((t) => t.team.rosterId === ahead.rosterId);
  if (!team) return null;
  const inDeal = new Set([...ahead.gives, ...ahead.gets].map((a) => a.assetId));
  const gets = packageValue(ahead.gets.map((a) => a.value));
  let best: Balancer | null = null;
  let bestGap = Math.abs(ahead.netValue);
  for (const a of teamAssets(team)) {
    if (inDeal.has(a.assetId) || a.value <= 0) continue;
    const gives = packageValue([...ahead.gives.map((x) => x.value), a.value]);
    const gap = Math.abs(gets - gives);
    if (gap < bestGap - 50) {
      bestGap = gap;
      best = { fromRosterId: ahead.rosterId, teamName: ahead.teamName, asset: a, newBalance: (gets - gives) / Math.max(gets, gives, 1) };
    }
  }
  return best;
}
