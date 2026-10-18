import { optimalLineup, type LineupCandidate } from "@/lib/analysis/lineup";
import type { LeagueModel, Strategy, TeamAnalysis } from "@/lib/analysis/types";
import { SKILL_POSITIONS, type SkillPosition } from "@/lib/league/models";
import { packageValue, type TradeAsset } from "./assets";

export type TradeObjective = Strategy;

/**
 * Side score = strategy-adjusted net value (per 1,000) + lineup weight × adj. PPG change
 * + need weight × severity of needs addressed − roster-overflow penalty.
 */
export const OBJECTIVE_WEIGHTS: Record<TradeObjective, { lineup: number; need: number }> = {
  contender: { lineup: 0.3, need: 1.0 },
  retool: { lineup: 0.15, need: 0.6 },
  rebuild: { lineup: 0, need: 0.2 },
};

/**
 * How much a team with a given strategy values an asset relative to its market value
 * (heuristic): rebuilders prefer picks and young players, contenders discount picks.
 */
export function strategyMultiplier(strategy: Strategy, a: TradeAsset): number {
  const young = a.kind === "pick" || (a.age != null && a.age <= YOUNG);
  if (strategy === "rebuild") return young ? 1.15 : a.ageRisk ? 0.75 : 0.95;
  if (strategy === "contender") return a.kind === "pick" ? 0.85 : 1;
  return a.ageRisk ? 0.9 : 1;
}

export type SideImpact = {
  rosterId: number;
  teamName: string;
  strategy: Strategy;
  gives: TradeAsset[];
  gets: TradeAsset[];
  valueOut: number;
  valueIn: number;
  /** Package-adjusted value change. */
  netValue: number;
  lineupBefore: number;
  lineupAfter: number;
  lineupDelta: number;
  positionDeltas: { position: SkillPosition; before: number; after: number }[];
  ageBefore: number | null;
  ageAfter: number | null;
  /** Value of picks and players aged ≤ 25 gained minus lost. */
  futureDelta: number;
  pickValueDelta: number;
  needsAddressed: SkillPosition[];
  /** Players that must be released to stay within the active roster limit. */
  rosterOverflow: number;
  /** The lowest-value active players who would be cut to make room. */
  cuts: { name: string; value: number }[];
  score: number;
  reasonsFor: string[];
  reasonsAgainst: string[];
};

export type TradeEvaluation = {
  id: string;
  mine: SideImpact;
  partner: SideImpact;
  /** Value difference relative to the larger package (positive favours me). */
  valueBalance: number;
  fit: "High" | "Medium" | "Low";
  partnerOutlook: "Likely interested" | "Possible" | "Unlikely";
  overall: number;
  risks: string[];
  helpsMe: Strategy[];
};

const YOUNG = 25;

function candidatesAfter(team: TeamAnalysis, gives: Set<string>, gets: TradeAsset[]): LineupCandidate[] {
  const keep = team.players
    .filter((p) => (p.slot === "starter" || p.slot === "bench") && !gives.has(p.assetId))
    .map((p) => ({ id: p.id, positions: p.position ? [p.position] : [], score: p.prod?.adjPpg ?? 0 }));
  const incoming = gets
    .filter((a) => a.kind === "player")
    .map((a) => ({ id: a.assetId.slice("player:".length), positions: a.position ? [a.position] : [], score: a.adjPpg ?? 0 }));
  return [...keep, ...incoming];
}

function topK(cands: LineupCandidate[], pos: string, k: number) {
  return cands.filter((c) => c.positions.includes(pos)).map((c) => c.score).sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
}

function weightedAge(items: { age: number | null; value: number }[]): number | null {
  const v = items.filter((i) => i.age != null && i.value > 0);
  const sum = v.reduce((a, i) => a + i.value, 0);
  return sum ? Math.round((v.reduce((a, i) => a + i.age! * i.value, 0) / sum) * 10) / 10 : null;
}

const futureValue = (assets: TradeAsset[]) =>
  assets.reduce((a, x) => a + (x.kind === "pick" || (x.age != null && x.age <= YOUNG) ? x.value : 0), 0);

export function evaluateSide(model: LeagueModel, team: TeamAnalysis, gives: TradeAsset[], gets: TradeAsset[], strategy: Strategy): SideImpact {
  const giveIds = new Set(gives.map((a) => a.assetId));
  const before = team.players
    .filter((p) => p.slot === "starter" || p.slot === "bench")
    .map((p) => ({ id: p.id, positions: p.position ? [p.position] : [], score: p.prod?.adjPpg ?? 0 }));
  const after = candidatesAfter(team, giveIds, gets);
  const lineupAfter = optimalLineup(after, model.league.startingSlots).total;
  const lineupDelta = Math.round((lineupAfter - team.lineup.total) * 100) / 100;

  const positionDeltas = SKILL_POSITIONS.map((pos) => ({
    position: pos,
    before: Math.round(topK(before, pos, model.startersPerPosition[pos]) * 10) / 10,
    after: Math.round(topK(after, pos, model.startersPerPosition[pos]) * 10) / 10,
  })).filter((d) => d.before !== d.after);

  const valueOut = packageValue(gives.map((a) => a.value));
  const valueIn = packageValue(gets.map((a) => a.value));
  const netValue = valueIn - valueOut;
  const futureDelta = futureValue(gets) - futureValue(gives);
  const pickValueDelta = gets.filter((a) => a.kind === "pick").reduce((a, x) => a + x.value, 0) - gives.filter((a) => a.kind === "pick").reduce((a, x) => a + x.value, 0);

  const playersBefore = team.players.map((p) => ({ age: p.age, value: p.value ?? 0, assetId: p.assetId }));
  const playersAfter = [...playersBefore.filter((p) => !giveIds.has(p.assetId)), ...gets.filter((a) => a.kind === "player").map((a) => ({ age: a.age, value: a.value, assetId: a.assetId }))];

  const needsAddressed = team.needs
    .filter((nd) => positionDeltas.some((d) => d.position === nd.position && d.after > d.before + 0.5))
    .map((nd) => nd.position);
  const needSeverity = team.needs.filter((nd) => needsAddressed.includes(nd.position)).reduce((a, nd) => a + nd.severity, 0);

  const activeLimit = model.league.startingSlots.length + model.league.benchSlots;
  const activeNow = team.players.filter((p) => p.slot === "starter" || p.slot === "bench").length;
  const playersIn = gets.filter((a) => a.kind === "player").length;
  const activeOut = gives.filter((a) => a.kind === "player" && (a.slot === "starter" || a.slot === "bench")).length;
  const rosterOverflow = Math.max(0, activeNow - activeOut + playersIn - activeLimit);
  // Roster-spot cost: the value of the players who would have to be released (lowest value first).
  const cuts = rosterOverflow
    ? team.players
        .filter((p) => (p.slot === "starter" || p.slot === "bench") && !giveIds.has(p.assetId))
        .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
        .slice(0, rosterOverflow)
        .map((p) => ({ name: p.name, value: p.value ?? 0 }))
    : [];
  const cutCost = cuts.reduce((a, c) => a + c.value, 0);

  const w = OBJECTIVE_WEIGHTS[strategy];
  const eff = (assets: TradeAsset[]) => packageValue(assets.map((a) => a.value * strategyMultiplier(strategy, a)));
  const effectiveNet = eff(gets) - eff(gives);
  const score = (effectiveNet - cutCost) / 1000 + w.lineup * lineupDelta + w.need * needSeverity - 0.1 * rosterOverflow;

  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];
  if (lineupDelta >= 1) reasonsFor.push(`Best lineup improves by ${lineupDelta.toFixed(1)} adj. PPG.`);
  if (lineupDelta <= -1) reasonsAgainst.push(`Best lineup drops by ${Math.abs(lineupDelta).toFixed(1)} adj. PPG.`);
  if (needsAddressed.length) reasonsFor.push(`Addresses a weak spot: ${needsAddressed.join(", ")}.`);
  if (netValue > 300) reasonsFor.push(`Gains ${netValue.toLocaleString()} in package-adjusted value.`);
  if (netValue < -300) reasonsAgainst.push(`Gives up ${Math.abs(netValue).toLocaleString()} in package-adjusted value.`);
  if (strategy === "rebuild" && futureDelta > 0) reasonsFor.push(`Adds future value (picks/young players) for a rebuild.`);
  if (strategy === "rebuild" && futureDelta < -500) reasonsAgainst.push(`Sends away picks or young players while rebuilding.`);
  if (strategy === "contender" && lineupDelta < 0) reasonsAgainst.push(`Weakens a contending lineup.`);
  if (gets.length < gives.length && strategy !== "rebuild") reasonsFor.push(`Consolidates ${gives.length} assets into ${gets.length}, opening roster space.`);
  if (rosterOverflow) reasonsAgainst.push(`Must release ${cuts.map((c) => `${c.name} (${c.value.toLocaleString()})`).join(", ")} to stay within the ${activeLimit}-man active roster.`);

  return {
    rosterId: team.team.rosterId,
    teamName: team.team.teamName,
    strategy,
    gives,
    gets,
    valueOut,
    valueIn,
    netValue,
    lineupBefore: team.lineup.total,
    lineupAfter,
    lineupDelta,
    positionDeltas,
    ageBefore: weightedAge(playersBefore),
    ageAfter: weightedAge(playersAfter),
    futureDelta,
    pickValueDelta,
    needsAddressed,
    rosterOverflow,
    cuts,
    score: Math.round(score * 100) / 100,
    reasonsFor,
    reasonsAgainst,
  };
}

/** Evaluate a two-team trade from my perspective. Does not predict acceptance; it explains incentives. */
export function evaluateTrade(
  model: LeagueModel,
  args: { myRosterId: number; partnerRosterId: number; myGives: TradeAsset[]; theirGives: TradeAsset[]; objective: TradeObjective },
): TradeEvaluation {
  const me = model.teams.find((t) => t.team.rosterId === args.myRosterId);
  const them = model.teams.find((t) => t.team.rosterId === args.partnerRosterId);
  if (!me || !them) throw new Error("Unknown roster in trade");

  const mine = evaluateSide(model, me, args.myGives, args.theirGives, args.objective);
  const partner = evaluateSide(model, them, args.theirGives, args.myGives, them.strategy.effective);
  const bigger = Math.max(mine.valueIn, mine.valueOut, 1);
  const valueBalance = Math.round(((mine.valueIn - mine.valueOut) / bigger) * 100) / 100;

  // Partner trade activity (from league history): active traders are more likely to engage.
  const activity = model.history?.activityByRoster[args.partnerRosterId];
  const tradesSeen = model.history?.managers.find((m) => m.rosterId === args.partnerRosterId)?.trades;
  if (activity != null && activity >= 0.75) partner.reasonsFor.push(`Active trader: ${tradesSeen} trades since ${model.history!.seasonsCovered[0]}.`);
  if (activity != null && activity <= 0.25) partner.reasonsAgainst.push(`Rarely trades: ${tradesSeen} trades since ${model.history!.seasonsCovered[0]}.`);

  // Realism: reward mutual benefit, and penalize deals the partner has little reason to consider.
  const partnerOutlook = partner.score >= 0.3 ? "Likely interested" : partner.score >= -0.5 ? "Possible" : "Unlikely";
  const overall =
    Math.round((mine.score + 0.5 * Math.min(partner.score, 1.5) + (partner.score < 0 ? 0.8 * partner.score : 0) + (activity != null ? 0.4 * (activity - 0.5) : 0)) * 100) / 100;
  const fit = mine.score >= 1 && partner.score >= 0 ? "High" : mine.score >= 0.3 && partner.score >= -0.5 ? "Medium" : "Low";

  const risks: string[] = [];
  const all = [...args.myGives, ...args.theirGives];
  for (const a of args.theirGives) {
    const p = them.players.find((x) => x.assetId === a.assetId);
    if (p?.injury) risks.push(`${p.name} is listed ${p.injury.status}${p.injury.bodyPart ? ` (${p.injury.bodyPart})` : ""} per Sleeper.`);
    if (p?.ageRisk) risks.push(`${p.name} (${p.age?.toFixed(1)}) is past the typical ${p.position} decline age.`);
    if (p && (p.prod?.activeWeeks ?? 0) < 2) risks.push(`${p.name} has fewer than 2 scoring weeks; production-based impact is uncertain.`);
  }
  if (all.some((a) => a.kind === "pick")) risks.push("Pick values are estimates; future slots are unknown.");
  if (model.valuation.kind === "internal-estimate") risks.push("No third-party valuation source: values are internal estimates.");

  const helpsMe: Strategy[] = [];
  if (mine.lineupDelta > 0.5) helpsMe.push("contender");
  if (mine.netValue >= -200 && mine.lineupDelta > -2) helpsMe.push("retool");
  if (mine.futureDelta > 0 || (mine.ageAfter != null && mine.ageBefore != null && mine.ageAfter < mine.ageBefore - 0.2)) helpsMe.push("rebuild");

  const id = [args.partnerRosterId, ...args.myGives.map((a) => a.assetId).sort(), "|", ...args.theirGives.map((a) => a.assetId).sort()].join(",");
  return { id, mine, partner, valueBalance, fit, partnerOutlook, overall, risks, helpsMe };
}
