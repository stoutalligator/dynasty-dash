import { buildLeagueModel } from "@/lib/analysis/model";
import type { LeagueSnapshot, PlayerInfo, Team, WeekResult } from "@/lib/league/models";
import { normalizeLeague } from "@/lib/league/normalize";
import { normalizePlayer } from "@/lib/players/normalize";
import type { ValuationSet } from "@/lib/providers/types";

/** A synthetic four-team superflex league with controlled production and values. */
export const SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"];
export const asOf = new Date("2026-10-18T00:00:00Z");

type Spec = { id: string; pos: string; age: number; ppg: number; value: number };

/** Four synthetic teams with controlled production and values. */
export const TEAMS: Record<number, Spec[]> = {
  1: [
    { id: "a-qb1", pos: "QB", age: 24, ppg: 18, value: 6000 },
    { id: "a-qb2", pos: "QB", age: 23, ppg: 8, value: 2000 },
    { id: "a-rb1", pos: "RB", age: 23, ppg: 15, value: 5000 },
    { id: "a-rb2", pos: "RB", age: 22, ppg: 6, value: 2500 },
    { id: "a-wr1", pos: "WR", age: 24, ppg: 16, value: 7000 },
    { id: "a-wr2", pos: "WR", age: 23, ppg: 9, value: 3500 },
    { id: "a-te1", pos: "TE", age: 22, ppg: 3, value: 1500 },
  ],
  2: [
    { id: "b-qb1", pos: "QB", age: 34, ppg: 22, value: 4000 },
    { id: "b-qb2", pos: "QB", age: 31, ppg: 17, value: 3000 },
    { id: "b-rb1", pos: "RB", age: 28, ppg: 14, value: 2200 },
    { id: "b-rb2", pos: "RB", age: 27, ppg: 10, value: 1500 },
    { id: "b-wr1", pos: "WR", age: 30, ppg: 13, value: 2500 },
    { id: "b-wr2", pos: "WR", age: 31, ppg: 9, value: 1200 },
    { id: "b-te1", pos: "TE", age: 31, ppg: 12, value: 2400 },
  ],
  3: [
    { id: "c-qb1", pos: "QB", age: 27, ppg: 21, value: 8000 },
    { id: "c-qb2", pos: "QB", age: 26, ppg: 19, value: 6000 },
    { id: "c-rb1", pos: "RB", age: 24, ppg: 18, value: 7000 },
    { id: "c-rb2", pos: "RB", age: 25, ppg: 14, value: 4000 },
    { id: "c-wr1", pos: "WR", age: 25, ppg: 19, value: 8000 },
    { id: "c-wr2", pos: "WR", age: 26, ppg: 14, value: 5000 },
    { id: "c-te1", pos: "TE", age: 26, ppg: 10, value: 4000 },
  ],
  4: [
    { id: "d-qb1", pos: "QB", age: 29, ppg: 12, value: 2000 },
    { id: "d-qb2", pos: "QB", age: 30, ppg: 6, value: 600 },
    { id: "d-rb1", pos: "RB", age: 26, ppg: 9, value: 1800 },
    { id: "d-rb2", pos: "RB", age: 29, ppg: 5, value: 400 },
    { id: "d-wr1", pos: "WR", age: 27, ppg: 10, value: 2600 },
    { id: "d-wr2", pos: "WR", age: 28, ppg: 6, value: 900 },
    { id: "d-te1", pos: "TE", age: 29, ppg: 6, value: 900 },
  ],
};
const RECORDS: Record<number, [number, number]> = { 1: [3, 3], 2: [4, 2], 3: [6, 0], 4: [0, 6] };

export function buildSnapshot(): LeagueSnapshot {
  const players: Record<string, PlayerInfo> = {};
  const all = Object.values(TEAMS).flat();
  for (const s of all) {
    const birth = new Date(asOf.getTime() - s.age * 365.2425 * 86400_000).toISOString().slice(0, 10);
    players[s.id] = normalizePlayer({ player_id: s.id, full_name: s.id, position: s.pos, fantasy_positions: [s.pos], team: "FA", birth_date: birth }, asOf);
  }
  const teams: Team[] = Object.entries(TEAMS).map(([rid, specs]) => ({
    rosterId: Number(rid), ownerId: `u${rid}`, manager: null, coOwners: [], teamName: `Team ${rid}`, avatarUrl: null,
    division: null, divisionName: null, wins: RECORDS[Number(rid)][0], losses: RECORDS[Number(rid)][1], ties: 0,
    pointsFor: specs.reduce((a, s) => a + s.ppg, 0) * 3, pointsAgainst: 300, potentialPoints: specs.reduce((a, s) => a + s.ppg, 0) * 3.3,
    streak: null, recentResults: null, waiverPosition: null, faabUsed: null, isMine: rid === "1",
    roster: specs.map((s) => ({ player: players[s.id], slot: "bench" as const, starterSlot: null })),
  }));
  const weeks: WeekResult[] = [1, 2, 3].map((week) => ({
    week, complete: true,
    entries: Object.entries(TEAMS).map(([rid, specs]) => ({
      rosterId: Number(rid), matchupId: Number(rid) <= 2 ? 1 : 2, points: 100, starters: [], startersPoints: [],
      playersPoints: Object.fromEntries(specs.map((s) => [s.id, s.ppg])),
    })),
  }));
  const league = normalizeLeague({
    league_id: "L", name: "Test League", season: "2026", status: "in_season", total_rosters: 4,
    roster_positions: [...SLOTS, "BN", "BN", "BN", "BN"], scoring_settings: { rec: 0.5 },
    settings: { num_teams: 4, draft_rounds: 2, leg: 4, last_scored_leg: 3, playoff_week_start: 6, playoff_teams: 2, league_average_match: 1 },
  });
  const picks = [1, 2, 3, 4].flatMap((rid) => [1, 2].map((round) => ({ season: "2027", round, originalRosterId: rid, ownerRosterId: rid, previousOwnerRosterId: null, source: "implied" as const, slot: null })));
  return {
    generatedAt: asOf.toISOString(), league, teams, picks, pickSeasons: ["2027"], transactions: [], weeks, schedule: [{ week: 4, pairs: [[1, 2], [3, 4]] }, { week: 5, pairs: [[1, 3], [2, 4]] }], players,
    freshness: {}, issues: [], verification: { configuredLeagueId: "L", leagueFound: true, expectedRosterId: 1, expectedTeamName: null, myRosterId: 1, myTeamName: "Team 1", notes: [] },
  };
}

export const external: ValuationSet = {
  providerId: "test", label: "Test values", description: "fixture", kind: "third-party", fetchedAt: asOf.toISOString(),
  format: { superflex: true, receptionPoints: 0.5, teams: 4 },
  players: Object.fromEntries(Object.values(TEAMS).flat().map((s) => [s.id, { value: s.value, redraftValue: null, overallRank: null, positionRank: null, trend30Day: null }])),
  picks: [
    { season: "2027", round: 1, bucket: null, value: 3000 },
    { season: "2027", round: 1, bucket: "early", value: 4500 },
    { season: "2027", round: 1, bucket: "mid", value: 3000 },
    { season: "2027", round: 1, bucket: "late", value: 2200 },
    { season: "2027", round: 2, bucket: null, value: 1000 },
  ],
};

export const model = buildLeagueModel({
  snapshot: buildSnapshot(),
  external,
  providerStatus: { configured: "test", active: "test", fetchedAt: null, stale: false, error: null },
  prefs: { strategyOverrides: {}, untouchables: [], tradeBlock: [], targets: [], savedProposals: [] },
});
export const team = (rid: number) => model.teams.find((t) => t.team.rosterId === rid)!;
