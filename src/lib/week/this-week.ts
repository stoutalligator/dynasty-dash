import { upcomingWeek } from "@/lib/league/week";
import { SLOT_ELIGIBILITY } from "@/lib/analysis/lineup";
import type { LeagueModel, PlayerView, TeamAnalysis } from "@/lib/analysis/types";
import { isUnavailable } from "@/lib/players/normalize";
import type { PlayerInfo } from "@/lib/league/models";

export type StartSitSwap = { start: PlayerView; bench: PlayerView | null; slot: string; gain: number };
export type LineupProblem = { player: PlayerView; reason: "bye" | "out" | "no projection" };
export type StartSit = {
  week: number;
  currentTotal: number;
  optimalTotal: number;
  gain: number;
  swaps: StartSitSwap[];
  problems: LineupProblem[];
  /** Better swaps that are no longer possible because a player involved has already played. */
  locked: number;
};

const unavailable = (p: PlayerView) => !!p.injury && isUnavailable({ injury: p.injury } as PlayerInfo);
/** What a starter is expected to score this week: 0 when on bye or ruled out. */
const expected = (p: PlayerView) => (p.onBye || unavailable(p) ? 0 : (p.projWeek ?? 0));

/**
 * Compare the lineup currently set in Sleeper with the best lineup by this week's projections
 * (players on bye or listed Out/IR excluded) and list the swaps that close the gap.
 */
export function startSit(team: TeamAnalysis, played: Set<string> = new Set()): StartSit | null {
  const opt = team.projectedLineup;
  if (!opt) return null;
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const current = team.players.filter((p) => p.slot === "starter");
  const currentIds = new Set(current.map((p) => p.id));
  const optimalIds = new Set(opt.assignments.map((a) => a.playerId).filter(Boolean) as string[]);
  const currentTotal = Math.round(current.reduce((a, p) => a + expected(p), 0) * 10) / 10;

  const toStart = opt.assignments
    .filter((a) => a.playerId && !currentIds.has(a.playerId))
    .map((a) => ({ player: byId.get(a.playerId!)!, slot: a.slot, score: a.score }))
    .filter((x) => x.player)
    .sort((a, b) => b.score - a.score);
  const toBench = current.filter((p) => !optimalIds.has(p.id)).sort((a, b) => expected(a) - expected(b));

  const swaps: StartSitSwap[] = [];
  const used = new Set<string>();
  for (const s of toStart) {
    const eligible = SLOT_ELIGIBILITY[s.slot] ?? [];
    const out =
      toBench.find((p) => !used.has(p.id) && p.starterSlot === s.slot) ??
      toBench.find((p) => !used.has(p.id) && eligible.includes(p.position ?? "")) ??
      toBench.find((p) => !used.has(p.id)) ??
      null;
    if (out) used.add(out.id);
    swaps.push({ start: s.player, bench: out, slot: s.slot, gain: Math.round((s.score - (out ? expected(out) : 0)) * 10) / 10 });
  }

  const problems: LineupProblem[] = current
    .filter((p) => p.onBye || unavailable(p) || p.projWeek == null || p.projWeek <= 0)
    .map((p) => ({ player: p, reason: p.onBye ? "bye" : unavailable(p) ? "out" : "no projection" }));

  return {
    week: opt.week,
    currentTotal,
    optimalTotal: opt.total,
    gain: Math.max(0, Math.round((opt.total - currentTotal) * 10) / 10),
    swaps: swaps.filter((s) => s.gain > 0.05 && !played.has(s.start.id) && !(s.bench && played.has(s.bench.id))),
    problems: problems.filter((p) => !played.has(p.player.id)),
    locked: swaps.filter((s) => s.gain > 0.05 && (played.has(s.start.id) || (s.bench && played.has(s.bench.id)))).length,
  };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export type BattlePlayer = { id: string; name: string; position: string | null; proj: number; live: number | null; played: boolean };
export type SlotBattle = { slot: string; mine: BattlePlayer | null; theirs: BattlePlayer | null };
export type Matchup = {
  week: number;
  opponent: TeamAnalysis;
  /** Expected final score: actual points for players who have played + projection for the rest. */
  myProjected: number;
  theirProjected: number;
  winProbability: number;
  /** Live points so far (null before kickoff). */
  live: { mine: number; theirs: number } | null;
  /** Share of starters (both teams) still to play; 0 = final. */
  remainingShare: number;
  battles: SlotBattle[];
};

/** A team's lineup as set in Sleeper this week, slot by slot, with projections and live points. */
function sleeperLineup(model: LeagueModel, team: TeamAnalysis, cal: number): { slot: string; player: BattlePlayer | null }[] {
  const slots = model.league.startingSlots;
  const live = model.liveWeek?.entries.find((e) => e.rosterId === team.team.rosterId);
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const proj = (p: PlayerView | undefined) => (p ? expected(p) * cal : 0);
  const make = (id: string | undefined, pts: number | null): BattlePlayer | null => {
    if (!id || id === "0") return null;
    const p = byId.get(id);
    const played = pts != null && pts !== 0;
    return { id, name: p?.name ?? "Unknown", position: p?.position ?? null, proj: Math.round(proj(p) * 10) / 10, live: pts, played };
  };
  if (live && live.starters.length) return slots.map((slot, i) => ({ slot, player: make(live.starters[i], live.startersPoints[i] ?? 0) }));
  // Before kickoff: the roster's starters, placed into slots in Sleeper's order.
  const remaining = team.players.filter((p) => p.slot === "starter");
  return slots.map((slot) => {
    const i = remaining.findIndex((p) => p.starterSlot === slot);
    const p = i >= 0 ? remaining.splice(i, 1)[0] : undefined;
    return { slot, player: p ? make(p.id, null) : null };
  });
}

/**
 * This week's head-to-head using the lineups actually set in Sleeper: players who have played
 * count their real points, the rest their (calibrated) projection. The win probability uses the
 * season simulation's score spread, narrowed to the share of starters still to play.
 */
export function matchup(model: LeagueModel, team: TeamAnalysis): Matchup | null {
  const week = upcomingWeek(model.league);
  if (week == null || model.league.status !== "in_season") return null;
  const pair = model.schedule.find((s) => s.week === week)?.pairs.find((p) => p.includes(team.team.rosterId));
  if (!pair) return null;
  const opponent = model.teams.find((t) => t.team.rosterId === (pair[0] === team.team.rosterId ? pair[1] : pair[0]));
  if (!opponent) return null;
  const cal = model.odds?.calibration ?? 1;
  const sd = model.odds?.sd ?? 25;
  const mineL = sleeperLineup(model, team, cal);
  const theirsL = sleeperLineup(model, opponent, cal);
  const final = (l: typeof mineL) => l.reduce((a, s) => a + (s.player ? (s.player.played ? s.player.live! : s.player.proj) : 0), 0);
  const liveSum = (l: typeof mineL) => l.reduce((a, s) => a + (s.player?.live ?? 0), 0);
  const starters = [...mineL, ...theirsL].filter((s) => s.player);
  const remainingShare = starters.length ? starters.filter((s) => !s.player!.played).length / starters.length : 1;
  const mine = final(mineL), theirs = final(theirsL);
  const spread = sd * Math.SQRT2 * Math.sqrt(remainingShare);
  const winProbability = spread > 0 ? normalCdf((mine - theirs) / spread) : mine > theirs ? 1 : mine < theirs ? 0 : 0.5;
  const hasLive = !!model.liveWeek && starters.some((s) => s.player!.live != null);
  return {
    week,
    opponent,
    myProjected: Math.round(mine * 10) / 10,
    theirProjected: Math.round(theirs * 10) / 10,
    winProbability,
    live: hasLive ? { mine: Math.round(liveSum(mineL) * 100) / 100, theirs: Math.round(liveSum(theirsL) * 100) / 100 } : null,
    remainingShare,
    battles: mineL.map((m, i) => ({ slot: m.slot, mine: m.player, theirs: theirsL[i]?.player ?? null })),
  };
}
