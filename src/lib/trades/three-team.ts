import { z } from "zod";
import type { LeagueModel, TeamAnalysis } from "@/lib/analysis/types";
import { strategySchema } from "@/lib/prefs/store";
import { teamAssets, type TradeAsset } from "./assets";
import { evaluateSide, type SideImpact } from "./evaluate";

/**
 * Exploratory three-team trades: a 1-for-1-for-1 cycle where I send asset A to team B, B sends
 * asset B to team C, and C sends asset C to me. Useful when the team that has what I want
 * (C) does not want what I have, but a third team (B) does and can pay C.
 */
export type ThreeTeamLeg = { from: number; to: number; asset: TradeAsset };
export type ThreeTeamEvaluation = {
  id: string;
  legs: ThreeTeamLeg[];
  /** [me, B, C] */
  sides: SideImpact[];
  overall: number;
  fit: "High" | "Medium" | "Low";
  notes: string[];
};

export const threeTeamOptionsSchema = z.object({
  objective: strategySchema,
  positions: z.array(z.string()).default([]),
  untouchables: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(30).default(12),
});
export type ThreeTeamOptions = z.input<typeof threeTeamOptionsSchema>;

const POOL = 12;
const BAND = 0.25;
const near = (a: number, b: number) => Math.abs(a - b) <= BAND * Math.max(a, b, 1);

/** Would this team plausibly want the asset? (fills a need, or matches a rebuilder's preferences). */
function wants(team: TeamAnalysis, a: TradeAsset): boolean {
  const needs = new Set<string>(team.needs.map((n) => n.position));
  if (a.kind === "player" && a.position && needs.has(a.position)) return true;
  if (team.strategy.effective === "rebuild") return a.kind === "pick" || (a.age != null && a.age <= 25);
  // Contenders want players who produce now.
  if (team.strategy.effective === "contender") return a.kind === "player" && (a.adjPpg ?? 0) >= 8;
  return a.kind === "player" && (a.age ?? 99) <= 27;
}

export function generateThreeTeamTrades(model: LeagueModel, myRosterId: number, input: ThreeTeamOptions): ThreeTeamEvaluation[] {
  const o = threeTeamOptionsSchema.parse(input);
  const me = model.teams.find((t) => t.team.rosterId === myRosterId);
  if (!me) throw new Error(`Roster ${myRosterId} not found`);
  const untouchable = new Set(o.untouchables);
  const top = (xs: TradeAsset[]) => xs.filter((a) => a.value >= 400).sort((a, b) => b.value - a.value).slice(0, POOL);

  const mine = top(teamAssets(me).filter((a) => !untouchable.has(a.assetId)));
  const others = model.teams.filter((t) => t.team.rosterId !== myRosterId);
  const assetsOf = new Map(others.map((t) => [t.team.rosterId, top(teamAssets(t))]));
  const iWant = (a: TradeAsset) =>
    (o.positions.length === 0 || o.positions.includes(a.kind === "pick" ? "PICK" : (a.position ?? ""))) &&
    (o.objective !== "rebuild" || a.kind === "pick" || (a.age != null && a.age <= 26));

  const results: ThreeTeamEvaluation[] = [];
  const seen = new Set<string>();
  for (const C of others) {
    for (const c of assetsOf.get(C.team.rosterId)!.filter(iWant)) {
      for (const a of mine) {
        if (!near(a.value, c.value)) continue;
        for (const B of others) {
          if (B === C || !wants(B, a)) continue;
          for (const b of assetsOf.get(B.team.rosterId)!) {
            if (!near(b.value, a.value) || !near(b.value, c.value) || !wants(C, b)) continue;
            const key = [a.assetId, b.assetId, c.assetId].join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            const sMe = evaluateSide(model, me, [a], [c], o.objective);
            if (sMe.score <= 0.5) continue;
            const sB = evaluateSide(model, B, [b], [a], B.strategy.effective);
            const sC = evaluateSide(model, C, [c], [b], C.strategy.effective);
            if (sB.score < -0.25 || sC.score < -0.25) continue;
            const overall = Math.round((sMe.score + 0.5 * Math.min(sB.score, 1.5) + 0.5 * Math.min(sC.score, 1.5)) * 100) / 100;
            const fit = sMe.score >= 1 && sB.score >= 0 && sC.score >= 0 ? "High" : sMe.score >= 0.5 ? "Medium" : "Low";
            const notes = [
              `${C.team.teamName} has ${c.label}; ${B.team.teamName} ${B.needs.some((n) => n.position === a.position) ? `needs a ${a.position}` : `fits ${a.label} as a ${B.strategy.effective}`}, and ${C.team.teamName} ${C.needs.some((n) => n.position === b.position) ? `needs a ${b.position}` : `gets ${b.label} for its ${C.strategy.effective} window`}.`,
              "Exploratory: three-team deals need all three managers to agree; incentives are inferred, not known.",
            ];
            results.push({
              id: key,
              legs: [
                { from: myRosterId, to: B.team.rosterId, asset: a },
                { from: B.team.rosterId, to: C.team.rosterId, asset: b },
                { from: C.team.rosterId, to: myRosterId, asset: c },
              ],
              sides: [sMe, sB, sC],
              overall,
              fit,
              notes,
            });
          }
        }
      }
    }
  }
  // Variety: one result per incoming asset, and no asset in more than three results.
  const byIncoming = new Set<string>();
  const uses = new Map<string, number>();
  return results
    .sort((x, y) => y.overall - x.overall)
    .filter((r) => {
      const k = r.legs[2].asset.assetId;
      if (byIncoming.has(k) || r.legs.some((l) => (uses.get(l.asset.assetId) ?? 0) >= 3)) return false;
      byIncoming.add(k);
      for (const l of r.legs) uses.set(l.asset.assetId, (uses.get(l.asset.assetId) ?? 0) + 1);
      return true;
    })
    .slice(0, o.limit);
}

