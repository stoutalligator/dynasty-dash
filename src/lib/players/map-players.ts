import type { SleeperRoster, SleeperUser } from "@/lib/sleeper/schemas";
import type { Issue, Manager, PlayerDb, RosteredPlayer, RosterSlot, Team } from "@/lib/league/models";
import { lookupPlayer } from "./normalize";

export function userAvatarUrl(u: SleeperUser): string | null {
  if (u.metadata?.avatar) return u.metadata.avatar;
  return u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null;
}

function toManager(u: SleeperUser): Manager {
  return { userId: u.user_id, displayName: u.display_name, avatarUrl: userAvatarUrl(u) };
}

const points = (whole: number | null | undefined, dec: number | null | undefined) =>
  whole == null ? null : Math.round((whole + (dec ?? 0) / 100) * 100) / 100;

/**
 * Determine each rostered player's designation. Reserve and taxi take precedence;
 * starters are matched to the league's starting slot labels by position in the array.
 */
export function classifyRoster(roster: SleeperRoster, startingSlots: string[], db: PlayerDb): RosteredPlayer[] {
  const reserve = new Set(roster.reserve ?? []);
  const taxi = new Set(roster.taxi ?? []);
  const starters = roster.starters ?? [];
  const starterSlotById = new Map<string, string>();
  starters.forEach((id, i) => {
    if (id && id !== "0") starterSlotById.set(id, startingSlots[i] ?? "STARTER");
  });

  // Union of all lists, so players appearing only in starters/taxi/reserve are never dropped.
  const ids = new Set<string>([...(roster.players ?? []), ...starterSlotById.keys(), ...taxi, ...reserve]);
  return [...ids].map((id) => {
    let slot: RosterSlot = "bench";
    if (reserve.has(id)) slot = "reserve";
    else if (taxi.has(id)) slot = "taxi";
    else if (starterSlotById.has(id)) slot = "starter";
    return { player: lookupPlayer(db, id), slot, starterSlot: slot === "starter" ? starterSlotById.get(id)! : null };
  });
}

export type MapTeamsInput = {
  rosters: SleeperRoster[];
  users: SleeperUser[];
  players: PlayerDb;
  startingSlots: string[];
  divisionNames: Record<number, string>;
  myRosterId: number | null;
};

/** Join rosters to managers and to readable player records, collecting any mapping problems. */
export function mapTeams({ rosters, users, players, startingSlots, divisionNames, myRosterId }: MapTeamsInput): {
  teams: Team[];
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const teams = [...rosters]
    .sort((a, b) => a.roster_id - b.roster_id)
    .map((r): Team => {
      const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
      if (!r.owner_id) {
        issues.push({ level: "warning", code: "roster-unowned", message: `Roster ${r.roster_id} has no owner (orphaned team).`, context: { rosterId: r.roster_id } });
      } else if (!owner) {
        issues.push({ level: "warning", code: "owner-not-in-users", message: `Owner ${r.owner_id} of roster ${r.roster_id} is not in the league user list.`, context: { rosterId: r.roster_id } });
      }
      const roster = classifyRoster(r, startingSlots, players);
      for (const rp of roster) {
        if (!rp.player.mapped) {
          issues.push({ level: "warning", code: "player-unmapped", message: `Player id ${rp.player.id} on roster ${r.roster_id} is not in the Sleeper player database.`, context: { rosterId: r.roster_id, playerId: rp.player.id } });
        }
      }
      const s = r.settings;
      const division = s.division ?? null;
      return {
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        manager: owner ? toManager(owner) : null,
        coOwners: (r.co_owners ?? []).map((id) => usersById.get(id)).filter((u): u is SleeperUser => !!u).map(toManager),
        teamName: owner?.metadata?.team_name?.trim() || owner?.display_name || `Team ${r.roster_id}`,
        avatarUrl: owner ? userAvatarUrl(owner) : null,
        division,
        divisionName: division != null ? (divisionNames[division] ?? `Division ${division}`) : null,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        pointsFor: points(s.fpts, s.fpts_decimal) ?? 0,
        pointsAgainst: points(s.fpts_against, s.fpts_against_decimal) ?? 0,
        potentialPoints: points(s.ppts, s.ppts_decimal),
        streak: r.metadata?.streak ?? null,
        recentResults: r.metadata?.record ?? null,
        waiverPosition: s.waiver_position ?? null,
        faabUsed: s.waiver_budget_used ?? null,
        roster,
        isMine: r.roster_id === myRosterId,
      };
    });

  return { teams, issues };
}
