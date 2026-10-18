import { z } from "zod";

/**
 * Runtime schemas for the public Sleeper API (https://docs.sleeper.com/).
 * Objects are "loose" so unknown fields are preserved for debugging and future use;
 * only the fields the app relies on are declared, and nullable ones are marked nullish.
 */

const num = z.number();
const str = z.string();

export const leagueSchema = z.looseObject({
  league_id: str,
  name: str,
  season: str,
  status: str,
  season_type: str.nullish(),
  sport: str.nullish(),
  total_rosters: num,
  avatar: str.nullish(),
  draft_id: str.nullish(),
  previous_league_id: str.nullish(),
  roster_positions: z.array(str),
  scoring_settings: z.record(str, num),
  metadata: z.record(str, str).nullish(),
  settings: z.looseObject({
    num_teams: num,
    type: num.nullish(),
    taxi_slots: num.nullish(),
    taxi_years: num.nullish(),
    reserve_slots: num.nullish(),
    draft_rounds: num.nullish(),
    divisions: num.nullish(),
    playoff_teams: num.nullish(),
    playoff_week_start: num.nullish(),
    trade_deadline: num.nullish(),
    pick_trading: num.nullish(),
    waiver_budget: num.nullish(),
    waiver_type: num.nullish(),
    league_average_match: num.nullish(),
    playoff_round_type: num.nullish(),
    leg: num.nullish(),
    last_scored_leg: num.nullish(),
    start_week: num.nullish(),
  }),
});
export type SleeperLeague = z.infer<typeof leagueSchema>;

/** Documented: /user/{username or user_id} (null when the user does not exist). */
export const sleeperAccountSchema = z
  .looseObject({ user_id: str, username: str.nullish(), display_name: str, avatar: str.nullish() })
  .nullable();
export type SleeperAccount = NonNullable<z.infer<typeof sleeperAccountSchema>>;

export const userSchema = z.looseObject({
  user_id: str,
  display_name: str,
  avatar: str.nullish(),
  is_owner: z.boolean().nullish(),
  metadata: z.looseObject({ team_name: str.optional(), avatar: str.optional() }).nullish(),
});
export const usersSchema = z.array(userSchema);
export type SleeperUser = z.infer<typeof userSchema>;

export const rosterSchema = z.looseObject({
  roster_id: num,
  owner_id: str.nullable(),
  co_owners: z.array(str).nullish(),
  players: z.array(str).nullish(),
  starters: z.array(str).nullish(),
  taxi: z.array(str).nullish(),
  reserve: z.array(str).nullish(),
  metadata: z.record(str, str).nullish(),
  settings: z.looseObject({
    wins: num,
    losses: num,
    ties: num,
    fpts: num.nullish(),
    fpts_decimal: num.nullish(),
    fpts_against: num.nullish(),
    fpts_against_decimal: num.nullish(),
    ppts: num.nullish(),
    ppts_decimal: num.nullish(),
    division: num.nullish(),
    waiver_position: num.nullish(),
    waiver_budget_used: num.nullish(),
    total_moves: num.nullish(),
  }),
});
export const rostersSchema = z.array(rosterSchema);
export type SleeperRoster = z.infer<typeof rosterSchema>;

export const tradedPickSchema = z.looseObject({
  season: str,
  round: num,
  /** Roster whose original pick this is. */
  roster_id: num,
  /** Roster that currently owns the pick. */
  owner_id: num,
  previous_owner_id: num.nullish(),
});
export const tradedPicksSchema = z.array(tradedPickSchema);
export type SleeperTradedPick = z.infer<typeof tradedPickSchema>;

export const draftSchema = z.looseObject({
  draft_id: str,
  season: str,
  status: str,
  type: str.nullish(),
  start_time: num.nullish(),
  draft_order: z.record(str, num).nullish(),
  slot_to_roster_id: z.record(str, num.nullable()).nullish(),
  settings: z.looseObject({ rounds: num.nullish(), teams: num.nullish() }).nullish(),
});
export const draftsSchema = z.array(draftSchema);
export type SleeperDraft = z.infer<typeof draftSchema>;

export const transactionSchema = z.looseObject({
  transaction_id: str,
  type: str,
  status: str,
  created: num,
  status_updated: num.nullish(),
  leg: num.nullish(),
  creator: str.nullish(),
  roster_ids: z.array(num),
  adds: z.record(str, num).nullish(),
  drops: z.record(str, num).nullish(),
  draft_picks: z.array(tradedPickSchema).nullish(),
  waiver_budget: z.array(z.looseObject({ sender: num, receiver: num, amount: num })).nullish(),
  settings: z.looseObject({ waiver_bid: num.nullish() }).nullish(),
});
export const transactionsSchema = z.array(transactionSchema);
export type SleeperTransaction = z.infer<typeof transactionSchema>;

export const matchupSchema = z.looseObject({
  roster_id: num,
  matchup_id: num.nullable(),
  points: num.nullish(),
  custom_points: num.nullish(),
  players: z.array(str).nullish(),
  starters: z.array(str).nullish(),
  starters_points: z.array(num).nullish(),
  players_points: z.record(str, num).nullish(),
});
export const matchupsSchema = z.array(matchupSchema);
export type SleeperMatchup = z.infer<typeof matchupSchema>;

export const nflStateSchema = z.looseObject({
  week: num,
  season: str,
  season_type: str,
  display_week: num.nullish(),
  leg: num.nullish(),
  league_season: str.nullish(),
  previous_season: str.nullish(),
});
export type SleeperNflState = z.infer<typeof nflStateSchema>;

/**
 * Weekly stat / projection lines keyed by player id. These come from Sleeper's public but
 * undocumented stats feed, so values are filtered to numbers and failures fall back gracefully.
 */
export const statLinesSchema = z.record(str, z.record(str, z.unknown()).nullable());
export type SleeperStatLines = z.infer<typeof statLinesSchema>;

/** Documented: /players/nfl/trending/{add|drop}. */
export const trendingSchema = z.array(z.looseObject({ player_id: str, count: num }));

/** Documented: /league/{id}/winners_bracket. `p` = placement game (1 = championship). */
export const bracketSchema = z.array(
  z.looseObject({ r: num, m: num, w: num.nullish(), l: num.nullish(), p: num.nullish(), t1: num.nullish(), t2: num.nullish() }),
);

/** Documented: /draft/{id}/picks. */
export const draftPicksSchema = z.array(
  z.looseObject({ round: num, pick_no: num, draft_slot: num, roster_id: num.nullish(), picked_by: str.nullish(), player_id: str.nullish() }),
);
export type SleeperDraftPick = z.infer<typeof draftPicksSchema>[number];

export const playerSchema = z.looseObject({
  player_id: str,
  full_name: str.nullish(),
  first_name: str.nullish(),
  last_name: str.nullish(),
  position: str.nullish(),
  fantasy_positions: z.array(str).nullish(),
  team: str.nullish(),
  age: num.nullish(),
  birth_date: str.nullish(),
  years_exp: num.nullish(),
  status: str.nullish(),
  active: z.boolean().nullish(),
  injury_status: str.nullish(),
  injury_body_part: str.nullish(),
  injury_notes: str.nullish(),
  practice_participation: str.nullish(),
  depth_chart_order: num.nullish(),
  number: num.nullish(),
  search_rank: num.nullish(),
  news_updated: num.nullish(),
});
export const playersSchema = z.record(str, playerSchema);
export type SleeperPlayer = z.infer<typeof playerSchema>;
