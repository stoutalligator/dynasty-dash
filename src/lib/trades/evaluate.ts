import { optimalLineup, type LineupCandidate } from "@/lib/analysis/lineup";
import type { LeagueModel, Strategy, TeamAnalysis } from "@/lib/analysis/types";
import type { SkillPosition } from "@/lib/league/models";
import type { OddsDelta } from "@/lib/sim/context";
import { packageValue, type TradeAsset } from "./assets";

export type TradeObjective = Strategy;

/**
 * Side score = strategy-adjusted net value (per 1,000) + lineup weight × lineup change (measured through the strategy lens)
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
  // Injured (Out/IR) players: a contender gets little this season, a retooler some; a rebuilder is
  // buying the long term, so the injury barely matters.
  const hurt = a.kind === "player" && a.unavailable;
  if (strategy === "rebuild") return young ? 1.15 : a.ageRisk ? 0.75 : 0.95;
  if (strategy === "contender") return a.kind === "pick" ? 0.85 : hurt ? 0.85 : 1;
  return (a.ageRisk ? 0.9 : 1) * (hurt ? 0.95 : 1);
}

/**
 * How each strategy measures a player's weekly contribution for lineup impact. Contenders care
 * about the rest of this season (Sleeper's projections, which are ~0 while a player is out);
 * retoolers split the difference with current production; rebuilders don't weigh lineups at all.
 */
export type LineupLens = "production" | "rest-of-season" | "blend";
export const LINEUP_LENS: Record<Strategy, LineupLens> = { contender: "rest-of-season", retool: "blend", rebuild: "production" };

export function lensScore(x: { formPpg: number | null; rosPpg: number | null; unavailable: boolean }, lens: LineupLens): number {
  const prod = x.formPpg ?? 0;
  // Unprojected players fall back to production, unless they are ruled out.
  const ros = x.rosPpg ?? (x.unavailable ? 0 : prod);
  if (lens === "production") return prod;
  if (lens === "rest-of-season") return ros;
  return (prod + ros) / 2;
}

export const LENS_UNIT: Record<LineupLens, string> = {
  production: "PPG (recent form)",
  "rest-of-season": "projected pts/wk (rest of season)",
  blend: "pts/wk (production + rest-of-season projection)",
};

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
  /** How lineup impact was measured for this side (follows its strategy). */
  lens: LineupLens;
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
  /** Season-simulation odds before → after for both sides (attached on the server when available). */
  odds?: { mine: OddsDelta; partner: OddsDelta } | null;
};

const YOUNG = 25;

type Cand = LineupCandidate;
const asCand = (p: TeamAnalysis["players"][number], lens: LineupLens): Cand => ({
  id: p.id,
  positions: p.position ? [p.position] : [],
  score: lensScore({ formPpg: p.prod?.formPpg ?? null, rosPpg: p.rosPpg, unavailable: p.tags.includes("Unavailable") }, lens),
});

/** Per-team data that every candidate trade reuses (computed once per team per model). */
type TeamCtx = {
  active: TeamAnalysis["players"];
  /** Active players sorted by value ascending: the first ones are cut when a roster overflows. */
  cutOrder: TeamAnalysis["players"];
  before: Cand[];
  lineupBefore: number;
  topBefore: Map<string, number>;
  playersBefore: { age: number | null; value: number; assetId: string }[];
  /** Lineup outcome per (players out, players in); picks never change a lineup, so many pairs share one. */
  lineups: Map<string, { lineupAfter: number; positionDeltas: SideImpact["positionDeltas"]; needsAddressed: SkillPosition[]; needSeverity: number }>;
};
const teamCtxCache = new WeakMap<TeamAnalysis, Map<LineupLens, TeamCtx>>();

function teamCtx(model: LeagueModel, team: TeamAnalysis, lens: LineupLens): TeamCtx {
  let byLens = teamCtxCache.get(team);
  if (!byLens) teamCtxCache.set(team, (byLens = new Map()));
  let c = byLens.get(lens);
  if (!c) {
    const active = team.players.filter((p) => p.slot === "starter" || p.slot === "bench");
    const before = active.map((p) => asCand(p, lens));
    c = {
      active,
      cutOrder: [...active].sort((a, b) => (a.value ?? 0) - (b.value ?? 0)),
      before,
      lineupBefore: optimalLineup(before, model.league.startingSlots).total,
      topBefore: new Map(model.gradedPositions.map((pos) => [pos, round1(topK(before, pos, model.startersPerPosition[pos]))])),
      playersBefore: team.players.map((p) => ({ age: p.age, value: p.value ?? 0, assetId: p.assetId })),
      lineups: new Map(),
    };
    byLens.set(lens, c);
  }
  return c;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function topK(cands: Cand[], pos: string, k: number) {
  return cands.filter((c) => c.positions.includes(pos)).map((c) => c.score).sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
}

function weightedAge(items: { age: number | null; value: number }[]): number | null {
  const v = items.filter((i) => i.age != null && i.value > 0);
  const sum = v.reduce((a, i) => a + i.value, 0);
  return sum ? Math.round((v.reduce((a, i) => a + i.age! * i.value, 0) / sum) * 10) / 10 : null;
}

const futureValue = (assets: TradeAsset[]) =>
  assets.reduce((a, x) => a + (x.kind === "pick" || (x.age != null && x.age <= YOUNG) ? x.value : 0), 0);

/**
 * The numeric core of a side's evaluation: everything the score needs, without building reason
 * strings. The trade generator scores thousands of candidate pairs with this and only builds the
 * full explanation (`evaluateSide`) for the ones it keeps.
 */
export function scoreSide(model: LeagueModel, team: TeamAnalysis, gives: TradeAsset[], gets: TradeAsset[], strategy: Strategy) {
  const lens = LINEUP_LENS[strategy];
  const ctx = teamCtx(model, team, lens);
  const giveIds = new Set(gives.map((a) => a.assetId));
  const playersIn = gets.filter((a) => a.kind === "player");

  const key = `${playerKey(gives)}|${playerKey(gets)}`;
  let lu = ctx.lineups.get(key);
  if (!lu) {
    const after = [
      ...ctx.before.filter((c) => !giveIds.has(`player:${c.id}`)),
      ...playersIn.map((a) => ({ id: a.assetId.slice("player:".length), positions: a.position ? [a.position] : [], score: lensScore(a, lens) })),
    ];
    const positionDeltas = model.gradedPositions
      .map((pos) => ({ position: pos, before: ctx.topBefore.get(pos)!, after: round1(topK(after, pos, model.startersPerPosition[pos])) }))
      .filter((d) => d.before !== d.after);
    const needsAddressed = team.needs
      .filter((nd) => positionDeltas.some((d) => d.position === nd.position && d.after > d.before + 0.5))
      .map((nd) => nd.position);
    const needSeverity = team.needs.filter((nd) => needsAddressed.includes(nd.position)).reduce((a, nd) => a + nd.severity, 0);
    lu = { lineupAfter: optimalLineup(after, model.league.startingSlots).total, positionDeltas, needsAddressed, needSeverity };
    if (ctx.lineups.size > 50_000) ctx.lineups.clear(); // bound memory on very wide searches
    ctx.lineups.set(key, lu);
  }
  const { lineupAfter, positionDeltas, needsAddressed, needSeverity } = lu;
  const lineupDelta = Math.round((lineupAfter - ctx.lineupBefore) * 100) / 100;

  const activeLimit = model.league.startingSlots.length + model.league.benchSlots;
  const activeOut = gives.filter((a) => a.kind === "player" && (a.slot === "starter" || a.slot === "bench")).length;
  const rosterOverflow = Math.max(0, ctx.active.length - activeOut + playersIn.length - activeLimit);
  // Roster-spot cost: the value of the players who would have to be released (lowest value first).
  const cuts = rosterOverflow
    ? ctx.cutOrder.filter((p) => !giveIds.has(p.assetId)).slice(0, rosterOverflow).map((p) => ({ name: p.name, value: p.value ?? 0 }))
    : [];
  const cutCost = cuts.reduce((a, c) => a + c.value, 0);

  const w = OBJECTIVE_WEIGHTS[strategy];
  const effectiveNet = effectiveValue(gets, strategy) - effectiveValue(gives, strategy);
  const score = (effectiveNet - cutCost) / 1000 + w.lineup * lineupDelta + w.need * needSeverity - 0.1 * rosterOverflow;
  return { ctx, lens, giveIds, lineupAfter, lineupDelta, positionDeltas, needsAddressed, activeLimit, rosterOverflow, cuts, score: Math.round(score * 100) / 100 };
}

// The generator passes the same package arrays to thousands of pairs, so per-package work is cached on the array.
const playerKeyCache = new WeakMap<TradeAsset[], string>();
function playerKey(assets: TradeAsset[]): string {
  let k = playerKeyCache.get(assets);
  if (k == null) {
    k = assets.filter((a) => a.kind === "player").map((a) => a.assetId).sort().join(",");
    playerKeyCache.set(assets, k);
  }
  return k;
}
const effCache = new WeakMap<TradeAsset[], Partial<Record<Strategy, number>>>();
/** Package value as a team with this strategy sees it. */
function effectiveValue(assets: TradeAsset[], strategy: Strategy): number {
  let byStrategy = effCache.get(assets);
  if (!byStrategy) effCache.set(assets, (byStrategy = {}));
  return (byStrategy[strategy] ??= packageValue(assets.map((a) => a.value * strategyMultiplier(strategy, a))));
}

export function evaluateSide(model: LeagueModel, team: TeamAnalysis, gives: TradeAsset[], gets: TradeAsset[], strategy: Strategy): SideImpact {
  const { ctx, lens, giveIds, lineupAfter, lineupDelta, positionDeltas, needsAddressed, activeLimit, rosterOverflow, cuts, score } = scoreSide(model, team, gives, gets, strategy);
  const valueOut = packageValue(gives.map((a) => a.value));
  const valueIn = packageValue(gets.map((a) => a.value));
  const netValue = valueIn - valueOut;
  const futureDelta = futureValue(gets) - futureValue(gives);
  const pickValueDelta = gets.filter((a) => a.kind === "pick").reduce((a, x) => a + x.value, 0) - gives.filter((a) => a.kind === "pick").reduce((a, x) => a + x.value, 0);
  const playersAfter = [
    ...ctx.playersBefore.filter((p) => !giveIds.has(p.assetId)),
    ...gets.filter((a) => a.kind === "player").map((a) => ({ age: a.age, value: a.value, assetId: a.assetId })),
  ];

  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];
  const unit = LENS_UNIT[lens];
  if (lineupDelta >= 1) reasonsFor.push(`Best lineup improves by ${lineupDelta.toFixed(1)} ${unit}.`);
  if (lineupDelta <= -1) reasonsAgainst.push(`Best lineup drops by ${Math.abs(lineupDelta).toFixed(1)} ${unit}.`);
  for (const a of gets.filter((x) => x.kind === "player" && x.unavailable)) {
    if (strategy === "rebuild") reasonsFor.push(`${a.label} is injured, which matters little for a rebuild (possible buy-low).`);
    else reasonsAgainst.push(`${a.label} is ruled out: projected ${(a.rosPpg ?? 0).toFixed(1)} pts/wk for the rest of this season${strategy === "contender" ? ", so little help for a title run" : ""}.`);
  }
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
    lens,
    lineupBefore: ctx.lineupBefore,
    lineupAfter,
    lineupDelta,
    positionDeltas,
    ageBefore: weightedAge(ctx.playersBefore),
    ageAfter: weightedAge(playersAfter),
    futureDelta,
    pickValueDelta,
    needsAddressed,
    rosterOverflow,
    cuts,
    score,
    reasonsFor,
    reasonsAgainst,
  };
}

/** Ranking score for a trade: rewards mutual benefit and penalizes deals the partner has little reason to consider. */
export function overallScore(mineScore: number, partnerScore: number, partnerActivity: number | null | undefined): number {
  return (
    Math.round(
      (mineScore + 0.5 * Math.min(partnerScore, 1.5) + (partnerScore < 0 ? 0.8 * partnerScore : 0) + (partnerActivity != null ? 0.4 * (partnerActivity - 0.5) : 0)) * 100,
    ) / 100
  );
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
  const overall = overallScore(mine.score, partner.score, activity);
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
