import { optimalLineup } from "@/lib/analysis/lineup";
import type { LeagueModel, PlayerView } from "@/lib/analysis/types";
import type { WeekResult } from "@/lib/league/models";
import { isUnavailable } from "@/lib/players/normalize";
import type { PlayerInfo } from "@/lib/league/models";
import type { WeeklyLines } from "@/lib/stats/load";
import { simulateSeason, type SimInput, type SimTeam, type TeamOdds } from "./season";

type PlayerLite = { id: string; positions: string[]; slot: string | null; unavailable: boolean };

export type SimSummary = {
  runs: number;
  sd: number;
  calibration: number;
  regularWeeks: number[];
  playoffWeeks: number[];
  teams: (TeamOdds & { projectedPpg: number })[];
  assumptions: string[];
};

export type OddsDelta = { playoffBefore: number; playoffAfter: number; titleBefore: number; titleAfter: number };

type SimContext = {
  input: SimInput;
  slots: string[];
  projections: WeeklyLines;
  currentWeek: number;
  calibration: number;
  playersByRoster: Map<number, PlayerLite[]>;
  liteById: Map<string, PlayerLite>;
  tradeRuns: number;
  baselineTrade: Map<number, TeamOdds> | null;
};

const registry = new WeakMap<LeagueModel, SimContext>();

const lite = (p: PlayerView): PlayerLite => ({
  id: p.id,
  positions: p.position ? [p.position] : [],
  slot: p.slot,
  unavailable: !!p.injury && isUnavailable({ injury: p.injury } as PlayerInfo),
});

/**
 * Expected lineup score for a week: best lineup by Sleeper's projections. For the current week,
 * players listed Out/IR and IR-slot players are excluded; later weeks assume they may return.
 */
function weekMean(players: PlayerLite[], week: number, ctx: Pick<SimContext, "projections" | "slots" | "currentWeek" | "calibration">): number {
  const proj = ctx.projections.get(week);
  if (!proj) return 0;
  const pool = players
    .filter((p) => p.slot !== "taxi" && (week > ctx.currentWeek || (p.slot !== "reserve" && !p.unavailable)))
    .map((p) => ({ id: p.id, positions: p.positions, score: proj.get(p.id)?.pts ?? 0 }));
  return optimalLineup(pool, ctx.slots).total * ctx.calibration;
}

/** Pooled within-team standard deviation of weekly scores across all available seasons. */
export function pooledWeeklySd(seasons: WeekResult[][]): number | null {
  let ss = 0;
  let df = 0;
  for (const weeks of seasons) {
    const byTeam = new Map<number, number[]>();
    for (const w of weeks) {
      if (!w.complete) continue;
      for (const e of w.entries) if (e.points > 0) byTeam.set(e.rosterId, [...(byTeam.get(e.rosterId) ?? []), e.points]);
    }
    for (const xs of byTeam.values()) {
      if (xs.length < 3) continue;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      ss += xs.reduce((a, x) => a + (x - m) ** 2, 0);
      df += xs.length - 1;
    }
  }
  return df > 10 ? Math.sqrt(ss / df) : null;
}

/**
 * Build the simulation for a league model and run the baseline. Returns null when there is no
 * schedule or projections to simulate (e.g. offseason).
 */
export function buildSeasonSim(opts: {
  model: LeagueModel;
  projections: WeeklyLines;
  completedWeeks: WeekResult[];
  historicalWeeks: WeekResult[][];
  schedule: { week: number; pairs: [number, number][] }[];
  runs: number;
  tradeRuns?: number;
}): SimSummary | null {
  const { model } = opts;
  const lg = model.league;
  if (!lg.playoffTeams || !lg.playoffWeekStart || opts.projections.size === 0) return null;
  const currentWeek = lg.currentWeek ?? (lg.lastScoredWeek ?? 0) + 1;
  const weeksPerRound = lg.playoffRoundType === 1 ? 2 : 1;
  const rounds = Math.ceil(Math.log2(Math.max(2, lg.playoffTeams)));
  const playoffWeeks = Array.from({ length: rounds * weeksPerRound }, (_, i) => lg.playoffWeekStart! + i);
  const regularWeeks = opts.schedule.map((s) => s.week);

  const playersByRoster = new Map(model.teams.map((t) => [t.team.rosterId, t.players.map(lite)]));
  const liteById = new Map([...model.teams.flatMap((t) => t.players), ...model.freeAgents].map((p) => [p.id, lite(p)]));
  const base = { projections: opts.projections, slots: lg.startingSlots, currentWeek, calibration: 1 };

  // Calibration: projections of optimal lineups vs. what teams actually scored in completed weeks.
  let projSum = 0;
  let actSum = 0;
  for (const w of opts.completedWeeks) {
    if (!w.complete || !opts.projections.has(w.week)) continue;
    for (const e of w.entries) {
      const players = playersByRoster.get(e.rosterId);
      if (!players || e.points <= 0) continue;
      projSum += weekMean(players, w.week, { ...base, currentWeek: Infinity });
      actSum += e.points;
    }
  }
  const calibration = projSum > 0 ? Math.min(1.3, Math.max(0.8, actSum / projSum)) : 1;
  const sd = pooledWeeklySd([opts.completedWeeks, ...opts.historicalWeeks]) ?? 25;

  const ctx: SimContext = {
    ...base,
    calibration,
    playersByRoster,
    liteById,
    tradeRuns: opts.tradeRuns ?? 3000,
    baselineTrade: null,
    input: { teams: [], schedule: opts.schedule, playoffWeeks, playoffTeams: lg.playoffTeams, medianGame: lg.medianGame, divisionWinnersSeedFirst: lg.divisions.length > 0, weeksPerRound, sd },
  };
  const simTeam = (rosterId: number, players: PlayerLite[]): SimTeam => {
    const t = model.teams.find((x) => x.team.rosterId === rosterId)!.team;
    return {
      rosterId,
      division: t.division,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pointsFor: t.pointsFor,
      weekMeans: new Map([...regularWeeks, ...playoffWeeks].map((w) => [w, weekMean(players, w, ctx)])),
    };
  };
  ctx.input.teams = model.teams.map((t) => simTeam(t.team.rosterId, playersByRoster.get(t.team.rosterId)!));
  registry.set(model, Object.assign(ctx, { simTeam }));

  const odds = simulateSeason(ctx.input, opts.runs);
  const weeksAll = [...regularWeeks, ...playoffWeeks];
  return {
    runs: opts.runs,
    sd: Math.round(sd * 10) / 10,
    calibration: Math.round(calibration * 1000) / 1000,
    regularWeeks,
    playoffWeeks,
    teams: odds.map((o) => {
      const means = ctx.input.teams.find((t) => t.rosterId === o.rosterId)!.weekMeans;
      return { ...o, projectedPpg: Math.round((weeksAll.reduce((a, w) => a + (means.get(w) ?? 0), 0) / Math.max(1, weeksAll.length)) * 10) / 10 };
    }),
    assumptions: [
      `${opts.runs.toLocaleString()} simulated seasons; weekly team scores ~ Normal(projected best lineup, ${Math.round(sd)} pts), the spread measured from ${opts.historicalWeeks.length + 1} seasons of this league's weekly scores.`,
      `Projections are Sleeper's, scaled by ${calibration.toFixed(2)} to match this league's actual scoring so far.`,
      lg.medianGame ? "Each week also counts as a game against the league median." : "Head-to-head games only.",
      lg.divisions.length ? "Division winners are assumed to qualify and take the top seeds, then best records (wins, then points for)." : "Seeds by record, then points for.",
      "Playoff rounds pair the highest remaining seed with the lowest; Sleeper's exact bracket and tiebreakers may differ.",
      `The in-progress week ${currentWeek} is simulated in full; rosters are assumed fixed (no future trades or pickups).`,
    ],
  };
}

/** Title/playoff odds after hypothetical roster changes, compared with an equal-size baseline run. */
export function oddsDelta(model: LeagueModel, changes: { rosterId: number; out: string[]; in: string[] }[]): Map<number, OddsDelta> | null {
  const ctx = registry.get(model) as (SimContext & { simTeam: (rid: number, p: PlayerLite[]) => SimTeam }) | undefined;
  if (!ctx) return null;
  ctx.baselineTrade ??= new Map(simulateSeason(ctx.input, ctx.tradeRuns).map((o) => [o.rosterId, o]));
  const teams = ctx.input.teams.map((t) => {
    const c = changes.find((x) => x.rosterId === t.rosterId);
    if (!c) return t;
    const out = new Set(c.out);
    const players = [
      ...ctx.playersByRoster.get(t.rosterId)!.filter((p) => !out.has(p.id)),
      ...c.in.map((id) => ({ ...(ctx.liteById.get(id) ?? { id, positions: [], unavailable: false }), slot: "bench" })),
    ];
    return ctx.simTeam(t.rosterId, players);
  });
  const after = new Map(simulateSeason({ ...ctx.input, teams }, ctx.tradeRuns).map((o) => [o.rosterId, o]));
  return new Map(
    changes.map((c) => {
      const b = ctx.baselineTrade!.get(c.rosterId)!;
      const a = after.get(c.rosterId)!;
      return [c.rosterId, { playoffBefore: b.playoffPct, playoffAfter: a.playoffPct, titleBefore: b.titlePct, titleAfter: a.titlePct }];
    }),
  );
}
