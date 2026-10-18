import type { WeekResult } from "@/lib/league/models";
import type { WeeklyLines } from "@/lib/stats/load";

export type WeeklyLine = {
  week: number;
  points: number;
  /** Whether a fantasy team started the player (null when unrostered that week). */
  started: boolean | null;
  rosterId: number | null;
  snapShare: number | null;
  opportunities: number | null;
  /** Played in the NFL game that week (fallback: scored non-zero). */
  played: boolean;
};

export type PlayerProduction = {
  playerId: string;
  /** Games played (from NFL stats) or, as a fallback, completed weeks with a non-zero score. */
  activeWeeks: number;
  total: number;
  /** Points per game played. */
  ppg: number;
  /** total / max(games, 2): shrinks tiny samples toward zero. Used for lineup strength. */
  adjPpg: number;
  /** PPG over the last three games played. */
  last3Ppg: number | null;
  /** Average offensive snap share (0–1) in games played. */
  snapShare: number | null;
  snapShareLast3: number | null;
  /** Snap share in the last two games minus the earlier games' average. */
  snapTrend: number | null;
  /** Targets + rush attempts per game (QBs: pass attempts + rushes). */
  oppPerGame: number | null;
  oppLast3: number | null;
  weeksStarted: number;
  weeksBenched: number;
  /** Points scored while sitting on a fantasy bench. */
  benchPoints: number;
  weekly: WeeklyLine[];
  source: "stats" | "matchups";
};

export const MIN_SAMPLE_WEEKS = 2;

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function blank(id: string, source: PlayerProduction["source"]): PlayerProduction {
  return {
    playerId: id, activeWeeks: 0, total: 0, ppg: 0, adjPpg: 0, last3Ppg: null, snapShare: null, snapShareLast3: null, snapTrend: null,
    oppPerGame: null, oppLast3: null, weeksStarted: 0, weeksBenched: 0, benchPoints: 0, weekly: [], source,
  };
}

/** Fantasy usage (started/benched) per week from league matchups. */
function usageByWeek(weeks: WeekResult[]) {
  const out = new Map<number, Map<string, { started: boolean; rosterId: number; points: number }>>();
  for (const w of weeks) {
    if (!w.complete) continue;
    const m = new Map<string, { started: boolean; rosterId: number; points: number }>();
    for (const e of w.entries) {
      const starters = new Set(e.starters);
      for (const [id, pts] of Object.entries(e.playersPoints)) m.set(id, { started: starters.has(id), rosterId: e.rosterId, points: pts });
    }
    out.set(w.week, m);
  }
  return out;
}

function finalize(p: PlayerProduction) {
  p.total = round(p.total);
  p.benchPoints = round(p.benchPoints);
  p.ppg = p.activeWeeks ? round(p.total / p.activeWeeks) : 0;
  p.adjPpg = round(p.total / Math.max(p.activeWeeks, MIN_SAMPLE_WEEKS));
  const played = p.weekly.filter((w) => w.played);
  const last3 = played.slice(-3);
  p.last3Ppg = last3.length ? round(last3.reduce((a, w) => a + w.points, 0) / last3.length) : null;
  const snaps = played.map((w) => w.snapShare).filter((s): s is number => s != null);
  p.snapShare = snaps.length ? round(avg(snaps)!, 3) : null;
  p.snapShareLast3 = snaps.length ? round(avg(snaps.slice(-3))!, 3) : null;
  p.snapTrend = snaps.length >= 3 ? round(avg(snaps.slice(-2))! - avg(snaps.slice(0, -2))!, 3) : null;
  const opps = played.map((w) => w.opportunities).filter((o): o is number => o != null);
  p.oppPerGame = opps.length ? round(avg(opps)!, 1) : null;
  p.oppLast3 = opps.length ? round(avg(opps.slice(-3))!, 1) : null;
}

/**
 * Production for every NFL player with stats, scored with league settings (completed weeks only),
 * merged with fantasy usage (started/benched) from the league's matchups.
 */
export function computeProductionFromStats(stats: WeeklyLines, weeks: WeekResult[], positionOf: (id: string) => string | null): Map<string, PlayerProduction> {
  const usage = usageByWeek(weeks);
  const out = new Map<string, PlayerProduction>();
  for (const w of [...stats.keys()].sort((a, b) => a - b)) {
    const lines = stats.get(w)!;
    const u = usage.get(w);
    const ids = new Set<string>([...lines.keys(), ...(u?.keys() ?? [])]);
    for (const id of ids) {
      const line = lines.get(id);
      const use = u?.get(id);
      const played = !!line && line.gp > 0;
      const points = line ? line.pts : (use?.points ?? 0);
      if (!played && !use && points === 0) continue;
      let p = out.get(id);
      if (!p) out.set(id, (p = blank(id, "stats")));
      const isQb = positionOf(id) === "QB";
      p.weekly.push({
        week: w,
        points,
        started: use ? use.started : null,
        rosterId: use?.rosterId ?? null,
        snapShare: line?.offSnp != null && line.tmOffSnp ? round(line.offSnp / line.tmOffSnp, 3) : null,
        opportunities: line && played ? (isQb ? line.passAtt + line.rushAtt : line.tgt + line.rushAtt) : null,
        played: played || (!line && points !== 0),
      });
      if (played || (!line && points !== 0)) {
        p.activeWeeks++;
        p.total += points;
      }
      if (use) {
        if (use.started) p.weeksStarted++;
        else {
          p.weeksBenched++;
          p.benchPoints += use.points;
        }
      }
    }
  }
  for (const p of out.values()) finalize(p);
  return out;
}

/**
 * Fallback when the stats feed is unavailable: production for rostered players only, from
 * league matchups. Games are approximated as completed weeks with a non-zero score.
 */
export function computeProduction(weeks: WeekResult[]): Map<string, PlayerProduction> {
  const out = new Map<string, PlayerProduction>();
  for (const w of weeks) {
    if (!w.complete) continue;
    for (const e of w.entries) {
      const starters = new Set(e.starters);
      for (const [id, pts] of Object.entries(e.playersPoints)) {
        let p = out.get(id);
        if (!p) out.set(id, (p = blank(id, "matchups")));
        const started = starters.has(id);
        p.weekly.push({ week: w.week, points: pts, started, rosterId: e.rosterId, snapShare: null, opportunities: null, played: pts !== 0 });
        p.total += pts;
        if (pts !== 0) p.activeWeeks++;
        if (started) p.weeksStarted++;
        else {
          p.weeksBenched++;
          p.benchPoints += pts;
        }
      }
    }
  }
  for (const p of out.values()) finalize(p);
  return out;
}

/** Team weekly scoring and head-to-head results for trend charts. */
export function teamWeeklyScores(weeks: WeekResult[]) {
  return weeks.map((w) => {
    const byMatch = new Map<number, { rosterId: number; points: number }[]>();
    for (const e of w.entries) {
      if (e.matchupId == null) continue;
      const list = byMatch.get(e.matchupId) ?? [];
      list.push({ rosterId: e.rosterId, points: e.points });
      byMatch.set(e.matchupId, list);
    }
    const sorted = [...w.entries].map((e) => e.points).sort((a, b) => a - b);
    const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0;
    return {
      week: w.week,
      complete: w.complete,
      median: round(median),
      teams: w.entries.map((e) => {
        const opp = e.matchupId != null ? byMatch.get(e.matchupId)?.find((x) => x.rosterId !== e.rosterId) : undefined;
        return {
          rosterId: e.rosterId,
          points: round(e.points),
          opponentRosterId: opp?.rosterId ?? null,
          opponentPoints: opp ? round(opp.points) : null,
          won: opp ? e.points > opp.points : null,
        };
      }),
    };
  });
}
