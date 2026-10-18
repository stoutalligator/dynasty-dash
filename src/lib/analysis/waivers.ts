import { isUnavailable } from "@/lib/players/normalize";
import type { PlayerInfo } from "@/lib/league/models";
import { fmtInt } from "@/lib/format";
import { optimalLineup } from "./lineup";
import { round } from "./production";
import type { LeagueModel, PlayerView, TeamAnalysis } from "./types";

export type PickupTier = "Strong add" | "Worth a look" | "Stash" | "Monitor";

export type WaiverCandidate = {
  player: PlayerView;
  /** 0–100 composite, ranked within the player's position among free agents. */
  score: number;
  tier: PickupTier;
  components: { production: number; opportunity: number; projection: number; trend: number; upside: number; market: number };
  reasons: string[];
  /** Adjusted PPG my best lineup would gain by adding him. */
  lineupGain: number;
  fillsNeed: boolean;
  droppedBy: { teamName: string; at: number } | null;
};

export type WaiverBoard = {
  candidates: WaiverCandidate[];
  dropCandidates: PlayerView[];
  faab: { budget: number; used: number; remaining: number } | null;
  waiverPosition: number | null;
};

/** Component weights for the pickup score. Transparent, documented heuristic. */
export const PICKUP_WEIGHTS = { production: 0.35, opportunity: 0.2, projection: 0.2, trend: 0.05, upside: 0.1, market: 0.1 } as const;

/** Per-game opportunity (targets + carries; QBs: dropbacks + carries) that counts as a full workload. */
const OPPORTUNITY_BENCHMARK: Record<string, number> = { QB: 35, RB: 16, WR: 8, TE: 6 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Component scores (0–1), anchored to absolute league benchmarks rather than ranks among free
 * agents (most free agents score almost nothing, so ranks would inflate weak players).
 */
export function pickupComponents(p: PlayerView, replacementPpg: number) {
  const pr = p.prod;
  const repl = Math.max(replacementPpg, 1);
  const recent = pr && pr.activeWeeks > 0 ? (pr.last3Ppg ?? pr.ppg) : null;
  // Shrink one-game samples so a single big week does not dominate.
  const production = recent != null ? clamp01(recent / (repl * 1.2)) * Math.min(1, (pr?.activeWeeks ?? 0) / 2) : 0;
  const snap = pr?.snapShareLast3 ?? null;
  const opp = pr?.oppLast3 ?? null;
  const oppScore = opp != null ? clamp01(opp / (OPPORTUNITY_BENCHMARK[p.position ?? ""] ?? 8)) : null;
  const opportunity = snap != null && oppScore != null ? (snap + oppScore) / 2 : (snap ?? oppScore ?? 0);
  const projection = p.projWeek != null ? clamp01(p.projWeek / (repl * 1.2)) : 0;
  const trend = pr?.snapTrend != null ? clamp01(0.5 + pr.snapTrend / 0.4) : 0.4;
  const youth = p.age != null && p.age <= 24 && (p.yearsExp ?? 9) <= 2 ? 0.6 : 0;
  const upside = Math.max(p.value != null ? clamp01(p.value / 2500) : 0, youth);
  const market = p.trendingAdds ? clamp01(Math.log10(p.trendingAdds + 1) / 5) : 0;
  return { production, opportunity, projection, trend, upside, market };
}

/**
 * Rank every free agent at QB/RB/WR/TE as a potential pickup ("sleepers on the wire"), using real
 * NFL usage and production scored with this league's settings, Sleeper projections, third-party
 * dynasty value when available, and Sleeper-wide add trends. Fit to my roster is computed separately.
 */
export function buildWaiverBoard(model: LeagueModel, me: TeamAnalysis | null, waiverBudget: number | null): WaiverBoard {
  const fas = model.freeAgents;
  const byPos = new Map<string, PlayerView[]>();
  for (const p of fas) byPos.set(p.position ?? "?", [...(byPos.get(p.position ?? "?") ?? []), p]);

  // My eligible lineup pool, for "would he start for me?".
  const myPool = me
    ? me.players.filter((p) => p.slot === "starter" || p.slot === "bench").map((p) => ({ id: p.id, positions: p.position ? [p.position] : [], score: p.prod?.adjPpg ?? 0 }))
    : [];
  const needs = new Set(me?.needs.map((n) => n.position) ?? []);

  // Recently dropped in this league (last 21 days).
  const cutoff = Date.now() - 21 * 86400_000;
  const dropped = new Map<string, { teamName: string; at: number }>();
  for (const t of model.transactions) {
    if (t.status !== "complete" || t.createdAt < cutoff) continue;
    for (const d of t.drops) {
      if (!dropped.has(d.playerId)) dropped.set(d.playerId, { teamName: model.teams.find((x) => x.team.rosterId === d.rosterId)?.team.teamName ?? "a team", at: t.createdAt });
    }
  }

  const candidates: WaiverCandidate[] = [];
  for (const [pos, group] of byPos) {
    const replacement = model.replacementPpg[pos as keyof typeof model.replacementPpg] ?? 0;
    for (const p of group) {
      const c = pickupComponents(p, replacement);
      const { production, opportunity, projection, trend, upside, market } = c;
      const score = Math.round(
        100 *
          (PICKUP_WEIGHTS.production * production +
            PICKUP_WEIGHTS.opportunity * opportunity +
            PICKUP_WEIGHTS.projection * projection +
            PICKUP_WEIGHTS.trend * trend +
            PICKUP_WEIGHTS.upside * upside +
            PICKUP_WEIGHTS.market * market),
      );

      const lineupGain = me
        ? round(optimalLineup([...myPool, { id: p.id, positions: p.position ? [p.position] : [], score: p.prod?.adjPpg ?? 0 }], model.league.startingSlots).total - me.lineup.total)
        : 0;
      const unavailable = !!p.injury && isUnavailable({ injury: p.injury } as PlayerInfo);
      const producing = (p.prod?.last3Ppg ?? 0) >= replacement || (p.projWeek ?? 0) >= replacement;
      const tier: PickupTier =
        score >= 60 && producing && !unavailable ? "Strong add" : score >= 45 && !unavailable ? "Worth a look" : upside >= 0.6 ? "Stash" : "Monitor";

      const reasons: string[] = [];
      const pr = p.prod;
      if (pr && pr.activeWeeks > 0) {
        reasons.push(`${pr.ppg.toFixed(1)} PPG in ${pr.activeWeeks} game${pr.activeWeeks > 1 ? "s" : ""}${pr.last3Ppg != null && pr.activeWeeks > 3 ? ` (${pr.last3Ppg.toFixed(1)} last 3)` : ""}`);
        if (pr.snapShareLast3 != null) {
          const t = pr.snapTrend != null && Math.abs(pr.snapTrend) >= 0.08 ? ` (${pr.snapTrend > 0 ? "▲" : "▼"} ${Math.round(Math.abs(pr.snapTrend) * 100)} pts)` : "";
          reasons.push(`${Math.round(pr.snapShareLast3 * 100)}% snap share recently${t}`);
        }
        if (pr.oppLast3 != null && pos !== "QB") reasons.push(`${pr.oppLast3.toFixed(1)} targets + carries per game recently`);
      } else {
        reasons.push("No NFL production yet this season");
      }
      if (p.projWeek != null && p.projWeek > 0) reasons.push(`Projected ${p.projWeek.toFixed(1)} this week${p.projNext != null ? `, ${p.projNext.toFixed(1)} over the next ${model.projectionWeeks.length}` : ""}`);
      if (p.trendingAdds) reasons.push(`${fmtInt(p.trendingAdds)} Sleeper adds in 48h`);
      if (p.value) reasons.push(`Dynasty value ${fmtInt(p.value)}${p.positionRank ? ` (${pos}${p.positionRank})` : ""}`);
      if (p.age != null && p.age <= 24 && (p.yearsExp ?? 9) <= 2 && !p.value) reasons.push(`Age ${p.age?.toFixed(1)}, ${p.yearsExp === 0 ? "rookie" : `${p.yearsExp} yr exp`}: development upside`);
      if (lineupGain > 0.05) reasons.push(`Would start for you: +${lineupGain.toFixed(1)} adj. PPG to your best lineup`);
      if (needs.has(pos as never)) reasons.push(`Plays a position you need (${pos})`);
      if (unavailable) reasons.push(`Listed ${p.injury!.status} by Sleeper`);
      const droppedBy = dropped.get(p.id) ?? null;
      if (droppedBy) reasons.push(`Recently dropped by ${droppedBy.teamName}`);

      candidates.push({
        player: p,
        score,
        tier,
        components: { production: round(production, 2), opportunity: round(opportunity, 2), projection: round(projection, 2), trend: round(trend, 2), upside: round(upside, 2), market: round(market, 2) },
        reasons,
        lineupGain,
        fillsNeed: needs.has(pos as never),
        droppedBy,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const dropCandidates = (me?.players ?? [])
    .filter((p) => p.slot === "bench" && p.lineupImpact === 0 && !p.tags.includes("Core"))
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0) || (a.prod?.ppg ?? 0) - (b.prod?.ppg ?? 0))
    .slice(0, 5);

  const used = me?.team.faabUsed ?? null;
  return {
    candidates,
    dropCandidates,
    faab: waiverBudget != null && waiverBudget > 0 && used != null ? { budget: waiverBudget, used, remaining: waiverBudget - used } : null,
    waiverPosition: me?.team.waiverPosition ?? null,
  };
}
