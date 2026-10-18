import { loadLeagueHistory } from "@/lib/history/load";
import { loadLeagueSnapshot, type RefreshScope } from "@/lib/league/load-snapshot";
import type { LeagueSnapshot } from "@/lib/league/models";
import { logger } from "@/lib/log";
import { readPrefs, type Prefs } from "@/lib/prefs/store";
import { loadExternalValuations } from "@/lib/providers";
import { loadStatsBundle, loadTrending } from "@/lib/stats/load";
import { buildLeagueModel } from "./model";
import type { LeagueModel } from "./types";

const log = logger("model");

let memo: { key: string; snapshot: LeagueSnapshot; model: LeagueModel } | undefined;

/**
 * Server-only entry point used by pages and server actions: live (cached) Sleeper data + weekly
 * stats/projections + valuations + league history + user preferences → analytical model.
 * Rebuilt whenever any input changes. Optional sources degrade gracefully when unavailable.
 */
export async function loadLeagueModel(opts: { refresh?: RefreshScope } = {}): Promise<{ model: LeagueModel; snapshot: LeagueSnapshot; prefs: Prefs }> {
  const snapshot = await loadLeagueSnapshot({ refresh: opts.refresh });
  const { league } = snapshot;
  const force = opts.refresh != null && opts.refresh !== "none";
  const lastScored = league.lastScoredWeek ?? 0;
  const completedWeeks = Array.from({ length: lastScored }, (_, i) => i + 1);
  const inSeason = league.status === "in_season" && league.currentWeek != null;
  const projectionWeeks = inSeason ? [0, 1, 2].map((d) => league.currentWeek! + d).filter((w) => w <= 18) : [];

  const [{ set, status }, prefs, stats, trending, history] = await Promise.all([
    loadExternalValuations({ superflex: league.format.superflex, receptionPoints: league.format.receptionPoints, teams: snapshot.teams.length }, { force: opts.refresh === "all" }),
    readPrefs(),
    loadStatsBundle({ season: league.season, completedWeeks, projectionWeeks, scoring: league.scoringSettings, force }).catch((err) => {
      log.warn("stats bundle failed", { error: String(err) });
      return null;
    }),
    loadTrending({ force }),
    loadLeagueHistory({ currentLeagueId: league.id, previousLeagueId: league.previousLeagueId, force: opts.refresh === "all" }).catch((err) => {
      log.warn("history failed", { error: String(err) });
      return null;
    }),
  ]);

  const key = JSON.stringify([
    snapshot.generatedAt,
    set?.fetchedAt ?? null,
    stats?.freshness ?? null,
    trending?.fetchedAt ?? null,
    history?.seasons.map((s) => s.season) ?? null,
    prefs.strategyOverrides,
  ]);
  if (memo && memo.snapshot === snapshot && memo.key === key) return { model: memo.model, snapshot, prefs };

  const model = buildLeagueModel({ snapshot, external: set, providerStatus: status, prefs, stats, trending, history });
  const extra = [...(stats?.issues ?? []), ...(history?.issues ?? [])];
  if (!set && status.error) extra.push({ level: "warning", code: "valuation-unavailable", message: `${status.configured} valuations unavailable (${status.error}); using the internal estimate.` });
  if (!stats || stats.stats.size === 0) extra.push({ level: "warning", code: "stats-fallback", message: "Weekly NFL stats unavailable; production uses league matchups (rostered players only)." });
  if (!trending) extra.push({ level: "info", code: "trending-unavailable", message: "Sleeper trending adds could not be loaded." });
  model.issues = [...model.issues, ...extra];
  if (stats) model.freshness = { ...model.freshness, ...stats.freshness };
  memo = { key, snapshot, model };
  return { model, snapshot, prefs };
}
