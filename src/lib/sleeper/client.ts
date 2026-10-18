import { ApiError, fetchJson, type FetchJsonOptions } from "./http";
import {
  bracketSchema,
  draftPicksSchema,
  draftSchema,
  draftsSchema,
  leagueSchema,
  matchupsSchema,
  nflStateSchema,
  playersSchema,
  rostersSchema,
  statLinesSchema,
  tradedPicksSchema,
  trendingSchema,
  transactionsSchema,
  usersSchema,
} from "./schemas";

export const SLEEPER_BASE = "https://api.sleeper.app/v1";

/** Thin, uncached access to the public Sleeper endpoints. No API key is required. */
export function createSleeperClient(opts: FetchJsonOptions = {}, base = SLEEPER_BASE) {
  const get = <S extends Parameters<typeof fetchJson>[1]>(p: string, schema: S, extra?: FetchJsonOptions) =>
    fetchJson(`${base}${p}`, schema, { ...opts, ...extra });

  return {
    async league(leagueId: string) {
      const league = await get(`/league/${leagueId}`, leagueSchema.nullable());
      if (!league) throw new ApiError(`League ${leagueId} not found`, `${base}/league/${leagueId}`, 200, "schema");
      return league;
    },
    users: (leagueId: string) => get(`/league/${leagueId}/users`, usersSchema),
    rosters: (leagueId: string) => get(`/league/${leagueId}/rosters`, rostersSchema),
    tradedPicks: (leagueId: string) => get(`/league/${leagueId}/traded_picks`, tradedPicksSchema),
    drafts: (leagueId: string) => get(`/league/${leagueId}/drafts`, draftsSchema),
    /** `round` is the league week / "leg" the transactions were processed in. */
    transactions: (leagueId: string, round: number) =>
      get(`/league/${leagueId}/transactions/${round}`, transactionsSchema),
    matchups: (leagueId: string, week: number) => get(`/league/${leagueId}/matchups/${week}`, matchupsSchema),
    nflState: () => get(`/state/nfl`, nflStateSchema),
    winnersBracket: (leagueId: string) => get(`/league/${leagueId}/winners_bracket`, bracketSchema),
    draftPicks: (draftId: string) => get(`/draft/${draftId}/picks`, draftPicksSchema),
    /** Single draft, including slot_to_roster_id (not present in the league drafts list). */
    draft: (draftId: string) => get(`/draft/${draftId}`, draftSchema),
    /** Most-added (or dropped) players across all Sleeper leagues. Documented endpoint. */
    trending: (type: "add" | "drop", lookbackHours = 48, limit = 100) =>
      get(`/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`, trendingSchema),
    /** Raw weekly stats for every NFL player (public, undocumented). ~550 KB per week. */
    weeklyStats: (season: string, week: number, seasonType = "regular") =>
      get(`/stats/nfl/${seasonType}/${season}/${week}`, statLinesSchema, { timeoutMs: 60_000 }),
    /** Weekly projected stat lines (public, undocumented). */
    weeklyProjections: (season: string, week: number, seasonType = "regular") =>
      get(`/projections/nfl/${seasonType}/${season}/${week}`, statLinesSchema, { timeoutMs: 60_000 }),
    /** ~15 MB. Sleeper asks callers to fetch this at most once per day. */
    players: (extra?: FetchJsonOptions) => get(`/players/nfl`, playersSchema, { timeoutMs: 120_000, ...extra }),
  };
}

export type SleeperClient = ReturnType<typeof createSleeperClient>;
