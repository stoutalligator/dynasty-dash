import { getCache } from "@/lib/cache/file-cache";
import type { Issue, SourceFreshness } from "@/lib/league/models";
import { logger } from "@/lib/log";
import { createSleeperClient, type SleeperClient } from "@/lib/sleeper/client";
import type { SleeperStatLines } from "@/lib/sleeper/schemas";
import { toStatLine, type StatLine } from "./scoring";

const log = logger("stats");
const MIN = 60_000;

export type WeeklyLines = Map<number, Map<string, StatLine>>;

export type StatsBundle = {
  /** League-scored stat lines per completed week (every NFL player, not only rostered). */
  stats: WeeklyLines;
  /** League-scored projections per upcoming week. */
  projections: WeeklyLines;
  freshness: Record<string, SourceFreshness>;
  issues: Issue[];
};

const slimMemo = new Map<string, Map<string, StatLine>>();

function slim(key: string, raw: SleeperStatLines, scoring: Record<string, number>): Map<string, StatLine> {
  const memoKey = `${key}|${JSON.stringify(scoring)}`;
  const hit = slimMemo.get(memoKey);
  if (hit) return hit;
  const out = new Map<string, StatLine>();
  for (const [id, stats] of Object.entries(raw)) {
    if (!stats) continue;
    const line = toStatLine(stats, scoring);
    if (line.gp > 0 || line.pts !== 0 || line.offSnp) out.set(id, line);
  }
  if (slimMemo.size > 64) slimMemo.clear();
  slimMemo.set(memoKey, out);
  return out;
}

/**
 * Load weekly stats for completed weeks and projections for upcoming weeks, scored with the
 * league's settings. These Sleeper feeds are undocumented, so any failure is reported as an
 * issue and the app falls back to matchup-derived production for rostered players.
 */
export async function loadStatsBundle(opts: {
  season: string;
  completedWeeks: number[];
  projectionWeeks: number[];
  /** Projections for weeks before this are historical (fixed) and cached long-term. */
  upcomingFrom?: number;
  scoring: Record<string, number>;
  force?: boolean;
  client?: SleeperClient;
}): Promise<StatsBundle> {
  const cache = getCache();
  const client = opts.client ?? createSleeperClient();
  const issues: Issue[] = [];
  const freshness: Record<string, SourceFreshness> = {};
  const last = Math.max(0, ...opts.completedWeeks);

  const statResults = await Promise.allSettled(
    opts.completedWeeks.map(async (w) => {
      const key = `stats-${opts.season}-regular-w${w}`;
      // The latest completed week can still receive stat corrections; older weeks rarely change.
      const c = await cache.getOrFetch(key, () => client.weeklyStats(opts.season, w), { ttlMs: w === last ? 60 * MIN : 24 * 60 * MIN, force: opts.force });
      return { w, key, c };
    }),
  );
  const projResults = await Promise.allSettled(
    opts.projectionWeeks.map(async (w) => {
      const key = `projections-${opts.season}-regular-w${w}`;
      const past = opts.upcomingFrom != null && w < opts.upcomingFrom;
      const c = await cache.getOrFetch(key, () => client.weeklyProjections(opts.season, w), { ttlMs: past ? 7 * 24 * 60 * MIN : 6 * 60 * MIN, force: opts.force && !past });
      return { w, key, c };
    }),
  );

  const stats: WeeklyLines = new Map();
  for (const r of statResults) {
    if (r.status === "rejected") {
      issues.push({ level: "warning", code: "stats-unavailable", message: `Weekly stats could not be loaded (${String(r.reason)}); free-agent production may be incomplete.` });
      continue;
    }
    stats.set(r.value.w, slim(r.value.key + r.value.c.fetchedAt, r.value.c.data, opts.scoring));
    freshness.stats = { fetchedAt: r.value.c.fetchedAt, source: r.value.c.source, stale: r.value.c.stale, ...(r.value.c.error ? { error: r.value.c.error } : {}) };
  }
  const projections: WeeklyLines = new Map();
  for (const r of projResults) {
    if (r.status === "rejected") {
      issues.push({ level: "info", code: "projections-unavailable", message: `Projections could not be loaded (${String(r.reason)}).` });
      continue;
    }
    projections.set(r.value.w, slim(r.value.key + r.value.c.fetchedAt, r.value.c.data, opts.scoring));
    freshness.projections = { fetchedAt: r.value.c.fetchedAt, source: r.value.c.source, stale: r.value.c.stale };
  }
  log.debug("stats loaded", { weeks: [...stats.keys()], projectionWeeks: [...projections.keys()] });
  return { stats, projections, freshness, issues };
}

/** Sleeper's cross-league trending adds/drops (documented). */
export async function loadTrending(opts: { force?: boolean; client?: SleeperClient } = {}) {
  const client = opts.client ?? createSleeperClient();
  try {
    const [adds, drops] = await Promise.all([
      getCache().getOrFetch("trending-add-48h", () => client.trending("add", 48, 200), { ttlMs: 30 * MIN, force: opts.force }),
      getCache().getOrFetch("trending-drop-48h", () => client.trending("drop", 48, 200), { ttlMs: 30 * MIN, force: opts.force }),
    ]);
    return {
      adds: new Map(adds.data.map((t) => [t.player_id, t.count])),
      drops: new Map(drops.data.map((t) => [t.player_id, t.count])),
      fetchedAt: adds.fetchedAt,
    };
  } catch (err) {
    log.warn("trending unavailable", { error: String(err) });
    return null;
  }
}
