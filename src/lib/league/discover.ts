import { getCache } from "@/lib/cache/file-cache";
import { userAvatarUrl } from "@/lib/players/map-players";
import { createSleeperClient, type SleeperClient } from "@/lib/sleeper/client";
import type { SleeperLeague } from "@/lib/sleeper/schemas";
import { LEAGUE_TYPE } from "./active";
import { describeFormat } from "./normalize";

export type LeagueOption = {
  leagueId: string;
  name: string;
  season: string;
  status: string;
  type: string;
  teams: number;
  format: string;
  avatarUrl: string | null;
};

export type SleeperAccountView = { userId: string; username: string; displayName: string; avatarUrl: string | null };

const MIN = 60_000;

export function toLeagueOption(l: SleeperLeague): LeagueOption {
  const f = describeFormat(l);
  return {
    leagueId: l.league_id,
    name: l.name,
    season: l.season,
    status: l.status.replace(/_/g, " "),
    type: LEAGUE_TYPE[l.settings.type ?? -1] ?? "League",
    teams: l.total_rosters,
    format: `${f.scoringLabel}${f.superflex ? " · Superflex" : ""}`,
    avatarUrl: l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null,
  };
}

/** Find a Sleeper account and its NFL leagues for the current season (falling back to last season). */
export async function findUserLeagues(username: string, client: SleeperClient = createSleeperClient()) {
  const name = username.trim().replace(/^@/, "");
  if (!/^[\w.-]{2,40}$/.test(name)) throw new Error("Enter a Sleeper username (letters, numbers, _ . -).");
  const cache = getCache();
  const account = (await cache.getOrFetch(`sleeper-user-${name.toLowerCase()}`, () => client.account(name), { ttlMs: 30 * MIN })).data;
  if (!account) throw new Error(`No Sleeper user named "${name}".`);
  const state = (await cache.getOrFetch("nfl-state", () => client.nflState(), { ttlMs: 60 * MIN })).data;
  const season = state.league_season ?? state.season;
  const fetchSeason = (s: string) => cache.getOrFetch(`user-${account.user_id}-leagues-${s}`, () => client.userLeagues(account.user_id, s), { ttlMs: 10 * MIN });
  let leagues = (await fetchSeason(season)).data;
  let shownSeason = season;
  if (!leagues.length && state.previous_season) {
    leagues = (await fetchSeason(state.previous_season)).data;
    shownSeason = state.previous_season;
  }
  // Dynasty leagues first, then by name.
  const order = (l: SleeperLeague) => (l.settings.type === 2 ? 0 : l.settings.type === 1 ? 1 : 2);
  leagues = [...leagues].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const view: SleeperAccountView = {
    userId: account.user_id,
    username: account.username ?? name,
    displayName: account.display_name,
    avatarUrl: account.avatar ? `https://sleepercdn.com/avatars/thumbs/${account.avatar}` : null,
  };
  return { account: view, season: shownSeason, leagues: leagues.map(toLeagueOption) };
}

/** Look up any league by id, with its teams, so a team can be picked without a username. */
export async function lookupLeague(leagueId: string, client: SleeperClient = createSleeperClient()) {
  const id = leagueId.trim();
  if (!/^\d{6,25}$/.test(id)) throw new Error("A Sleeper league id is a long number (find it in the league URL).");
  const [league, users, rosters] = await Promise.all([client.league(id), client.users(id), client.rosters(id)]);
  const byId = new Map(users.map((u) => [u.user_id, u]));
  return {
    league: toLeagueOption(league),
    teams: [...rosters]
      .sort((a, b) => a.roster_id - b.roster_id)
      .map((r) => {
        const u = r.owner_id ? byId.get(r.owner_id) : undefined;
        return {
          rosterId: r.roster_id,
          teamName: u?.metadata?.team_name?.trim() || u?.display_name || `Team ${r.roster_id}`,
          manager: u?.display_name ?? "No manager",
          avatarUrl: u ? userAvatarUrl(u) : null,
        };
      }),
  };
}
