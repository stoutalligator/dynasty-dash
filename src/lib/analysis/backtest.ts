import type { HistoricalSeason } from "@/lib/history/load";
import type { PlayerDb } from "@/lib/league/models";
import { optimalLineup } from "./lineup";
import { NOW_WEIGHTS } from "./strategy";

export type MetricKey = "record" | "pointsFor" | "potential" | "composite";

/** Composite weights mirroring the strategy "now" score (lineup + potential map to potential here). */
export const COMPOSITE_WEIGHTS = { potential: NOW_WEIGHTS.lineup + NOW_WEIGHTS.potential, pointsFor: NOW_WEIGHTS.pointsFor, record: NOW_WEIGHTS.win };

export type SeasonBacktest = {
  season: string;
  checkpointWeek: number;
  /** Spearman rank correlation with the final regular-season standings (1 = perfect). */
  rho: Record<MetricKey, number>;
  /** How many of the eventual playoff teams each metric had in its top N at the checkpoint. */
  playoffHits: Record<MetricKey, number>;
  playoffTeams: number;
};

export type BacktestReport = { checkpointWeek: number; seasons: SeasonBacktest[]; average: Record<MetricKey, number> | null };

/** Spearman correlation via Pearson on average ranks. */
export function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => {
    const sorted = v.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
    const r = new Array<number>(v.length);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].val === sorted[i].val) j++;
      for (let k = i; k <= j; k++) r[sorted[k].i] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? Math.round((num / Math.sqrt(dx * dy)) * 100) / 100 : 0;
}

const pctRank = (vals: number[]) => vals.map((v) => vals.filter((x) => x < v).length / Math.max(1, vals.length - 1));

/**
 * Replay completed seasons: from data available after `checkpointWeek`, how well did each signal
 * predict the final regular-season standings? "composite" mirrors the app's current-strength
 * score (lineup potential 60%, points for 20%, win % 20%).
 */
export function backtestSeasons(seasons: HistoricalSeason[], players: PlayerDb, checkpointWeek: number, weights = COMPOSITE_WEIGHTS): BacktestReport {
  const out: SeasonBacktest[] = [];
  for (const s of seasons) {
    if (s.status !== "complete" || s.weeks.length < checkpointWeek + 4) continue;
    const slots = s.league.roster_positions.filter((p) => p !== "BN");
    const median = s.league.settings.league_average_match === 1;
    const ids = s.rosters.map((r) => r.roster_id);
    const acc = new Map(ids.map((id) => [id, { pf: 0, potential: 0, wins: 0, games: 0 }]));
    for (const w of s.weeks.filter((x) => x.week <= checkpointWeek)) {
      const byMatch = new Map<number, { rid: number; pts: number }[]>();
      const scores = w.entries.map((e) => e.points).sort((a, b) => b - a);
      const cut = scores[Math.floor(scores.length / 2) - 1];
      for (const e of w.entries) {
        const a = acc.get(e.rosterId);
        if (!a) continue;
        a.pf += e.points;
        const pool = Object.entries(e.playersPoints).map(([id, pts]) => ({ id, positions: players[id]?.fantasyPositions ?? [], score: pts }));
        a.potential += optimalLineup(pool, slots).total;
        if (median) {
          a.games++;
          if (e.points >= cut) a.wins++;
        }
        if (e.matchupId != null) byMatch.set(e.matchupId, [...(byMatch.get(e.matchupId) ?? []), { rid: e.rosterId, pts: e.points }]);
      }
      for (const pair of byMatch.values()) {
        if (pair.length !== 2) continue;
        const [x, y] = pair;
        acc.get(x.rid)!.games++;
        acc.get(y.rid)!.games++;
        if (x.pts > y.pts) acc.get(x.rid)!.wins++;
        else if (y.pts > x.pts) acc.get(y.rid)!.wins++;
      }
    }
    const final = ids.map((id) => {
      const r = s.rosters.find((x) => x.roster_id === id)!.settings;
      return r.wins + (r.ties ?? 0) / 2 + ((r.fpts ?? 0) + (r.fpts_decimal ?? 0) / 100) / 100_000;
    });
    const metric = {
      record: ids.map((id) => acc.get(id)!.wins + acc.get(id)!.pf / 100_000),
      pointsFor: ids.map((id) => acc.get(id)!.pf),
      potential: ids.map((id) => acc.get(id)!.potential),
      composite: [] as number[],
    };
    const [pr, pf, pot] = [pctRank(metric.record), pctRank(metric.pointsFor), pctRank(metric.potential)];
    metric.composite = ids.map((_, i) => weights.potential * pot[i] + weights.pointsFor * pf[i] + weights.record * pr[i]);

    const playoffTeams = s.league.settings.playoff_teams ?? 6;
    const topBy = (v: number[]) => new Set(v.map((val, i) => ({ val, i })).sort((a, b) => b.val - a.val).slice(0, playoffTeams).map((x) => x.i));
    const actual = topBy(final);
    const hits = (v: number[]) => [...topBy(v)].filter((i) => actual.has(i)).length;
    const keys: MetricKey[] = ["record", "pointsFor", "potential", "composite"];
    out.push({
      season: s.season,
      checkpointWeek,
      rho: Object.fromEntries(keys.map((k) => [k, spearman(metric[k], final)])) as Record<MetricKey, number>,
      playoffHits: Object.fromEntries(keys.map((k) => [k, hits(metric[k])])) as Record<MetricKey, number>,
      playoffTeams,
    });
  }
  const average = out.length
    ? (Object.fromEntries((["record", "pointsFor", "potential", "composite"] as MetricKey[]).map((k) => [k, Math.round((out.reduce((a, s) => a + s.rho[k], 0) / out.length) * 100) / 100])) as Record<MetricKey, number>)
    : null;
  return { checkpointWeek, seasons: out, average };
}
