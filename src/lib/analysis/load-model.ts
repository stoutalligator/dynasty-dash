import { loadLeagueHistory } from "@/lib/history/load";
import { resolveActiveLeague } from "@/lib/league/active";
import { loadLeagueSnapshot, NoLeagueSelectedError, type RefreshScope } from "@/lib/league/load-snapshot";
import type { LeagueSnapshot } from "@/lib/league/models";
import { logger } from "@/lib/log";
import { readPrefs, type Prefs } from "@/lib/prefs/store";
import { loadExternalValuations } from "@/lib/providers";
import { loadStatsBundle, loadTrending } from "@/lib/stats/load";
import { getConfig } from "@/lib/config";
import { buildSeasonSim } from "@/lib/sim/context";
import { backtestSeasons } from "./backtest";
import { buildLeagueModel } from "./model";
import type { LeagueModel } from "./types";

const log = logger("model");

const memo = new Map<string, { key: string; snapshot: LeagueSnapshot; model: LeagueModel }>();

/**
 * Server-only entry point used by pages and server actions: live (cached) Sleeper data + weekly
 * stats/projections + valuations + league history + user preferences → analytical model.
 * Rebuilt whenever any input changes. Optional sources degrade gracefully when unavailable.
 */
export async function loadLeagueModel(opts: { refresh?: RefreshScope } = {}): Promise<{ model: LeagueModel; snapshot: LeagueSnapshot; prefs: Prefs }> {
  const active = await resolveActiveLeague();
  if (!active) throw new NoLeagueSelectedError();
  const snapshot = await loadLeagueSnapshot({ refresh: opts.refresh, active });
  const { league } = snapshot;
  const force = opts.refresh != null && opts.refresh !== "none";
  const lastScored = league.lastScoredWeek ?? 0;
  const completedWeeks = Array.from({ length: lastScored }, (_, i) => i + 1);
  const inSeason = league.status === "in_season" && league.currentWeek != null;
  // Projections: completed weeks (to calibrate the season simulation) through the championship week.
  const rounds = Math.ceil(Math.log2(Math.max(2, league.playoffTeams ?? 6))) * (league.playoffRoundType === 1 ? 2 : 1);
  const lastWeek = Math.min(18, (league.playoffWeekStart ?? 15) + rounds - 1);
  const projectionWeeks = inSeason ? Array.from({ length: lastWeek }, (_, i) => i + 1) : [];

  const [{ set, status }, prefs, stats, trending, history] = await Promise.all([
    loadExternalValuations(
      { superflex: league.format.superflex, receptionPoints: league.format.receptionPoints, teams: snapshot.teams.length, dynasty: league.leagueType !== 0 },
      { force: opts.refresh === "all" },
    ),
    readPrefs(active.leagueId),
    loadStatsBundle({ season: league.season, completedWeeks, projectionWeeks, upcomingFrom: league.currentWeek ?? undefined, scoring: league.scoringSettings, force }).catch((err) => {
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
  const prev = memo.get(active.leagueId);
  if (prev && prev.snapshot === snapshot && prev.key === key) return { model: prev.model, snapshot, prefs };

  const model = buildLeagueModel({ snapshot, external: set, providerStatus: status, prefs, stats, trending, history });
  try {
    model.odds = stats
      ? buildSeasonSim({
          model,
          projections: stats.projections,
          completedWeeks: snapshot.weeks,
          historicalWeeks: (history?.seasons ?? []).map((s) => s.weeks).filter((w) => w.length > 0),
          schedule: snapshot.schedule,
          runs: getConfig().simRuns,
        })
      : null;
  } catch (err) {
    log.warn("season simulation failed", { error: String(err) });
  }
  try {
    // Replay past seasons from the same point in the season we are at now (weeks 4–8).
    const checkpoint = Math.min(8, Math.max(4, league.lastScoredWeek ?? 6));
    model.modelCheck = history ? backtestSeasons(history.seasons, snapshot.players, checkpoint) : null;
  } catch (err) {
    log.warn("model check failed", { error: String(err) });
  }
  const extra = [...(stats?.issues ?? []), ...(history?.issues ?? [])];
  const storageWarning = getConfig().storage.warning;
  if (storageWarning) extra.push({ level: "warning", code: "storage-ephemeral", message: storageWarning });
  if (!set && status.error) extra.push({ level: "warning", code: "valuation-unavailable", message: `${status.configured} valuations unavailable (${status.error}); using the internal estimate.` });
  if (!stats || stats.stats.size === 0) extra.push({ level: "warning", code: "stats-fallback", message: "Weekly NFL stats unavailable; production uses league matchups (rostered players only)." });
  if (!trending) extra.push({ level: "info", code: "trending-unavailable", message: "Sleeper trending adds could not be loaded." });
  model.issues = [...model.issues, ...extra];
  if (stats) model.freshness = { ...model.freshness, ...stats.freshness };
  memo.set(active.leagueId, { key, snapshot, model });
  return { model, snapshot, prefs };
}
