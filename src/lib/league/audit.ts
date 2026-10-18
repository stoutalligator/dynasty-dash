import type { LeagueSnapshot } from "./models";
import { ordinal } from "./picks";

/** Build the human-readable league audit report (written to data/league-audit.json). */
export function buildAudit(s: LeagueSnapshot) {
  const teamName = (rid: number) => s.teams.find((t) => t.rosterId === rid)?.teamName ?? `Roster ${rid}`;
  const allPlayers = s.teams.flatMap((t) => t.roster);
  const unmapped = allPlayers.filter((p) => !p.player.mapped).map((p) => p.player.id);

  return {
    generatedAt: s.generatedAt,
    verification: s.verification,
    league: {
      id: s.league.id,
      name: s.league.name,
      season: s.league.season,
      status: s.league.status,
      teams: s.league.totalRosters,
      format: s.league.format,
      startingSlots: s.league.startingSlots,
      benchSlots: s.league.benchSlots,
      taxiSlots: s.league.taxiSlots,
      reserveSlots: s.league.reserveSlots,
      draftRounds: s.league.draftRounds,
      currentWeek: s.league.currentWeek,
      lastScoredWeek: s.league.lastScoredWeek,
      tradeDeadlineWeek: s.league.tradeDeadline,
      playoffs: { teams: s.league.playoffTeams, startWeek: s.league.playoffWeekStart },
      divisions: s.league.divisions.map((d) => d.name),
    },
    managers: s.teams.map((t) => ({
      rosterId: t.rosterId,
      teamName: t.teamName,
      manager: t.manager?.displayName ?? null,
      userId: t.ownerId,
      coOwners: t.coOwners.map((c) => c.displayName),
      isMine: t.isMine,
    })),
    rosters: s.teams.map((t) => {
      const by = (slot: string) =>
        t.roster
          .filter((p) => p.slot === slot)
          .map((p) => ({
            id: p.player.id,
            name: p.player.name,
            pos: p.player.position,
            nflTeam: p.player.nflTeam,
            age: p.player.age,
            injury: p.player.injury?.status ?? null,
            ...(p.starterSlot ? { lineupSlot: p.starterSlot } : {}),
            ...(p.player.mapped ? {} : { unmapped: true }),
          }));
      return {
        rosterId: t.rosterId,
        teamName: t.teamName,
        record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        potentialPoints: t.potentialPoints,
        division: t.divisionName,
        counts: {
          total: t.roster.length,
          starters: t.roster.filter((p) => p.slot === "starter").length,
          bench: t.roster.filter((p) => p.slot === "bench").length,
          taxi: t.roster.filter((p) => p.slot === "taxi").length,
          reserve: t.roster.filter((p) => p.slot === "reserve").length,
        },
        starters: by("starter"),
        bench: by("bench"),
        taxi: by("taxi"),
        reserve: by("reserve"),
      };
    }),
    playerMapping: {
      rosteredPlayers: allPlayers.length,
      mapped: allPlayers.length - unmapped.length,
      unmapped,
      playerDatabaseSize: Object.keys(s.players).length,
    },
    draftPicks: {
      seasons: s.pickSeasons,
      note: "Picks not listed in Sleeper's traded_picks are implied to belong to their original team.",
      byOwner: s.teams.map((t) => ({
        rosterId: t.rosterId,
        teamName: t.teamName,
        picks: s.picks
          .filter((p) => p.ownerRosterId === t.rosterId)
          .map((p) => `${p.season} ${ordinal(p.round)}${p.originalRosterId !== t.rosterId ? ` (via ${teamName(p.originalRosterId)})` : ""}`),
      })),
      traded: s.picks
        .filter((p) => p.source === "traded_picks")
        .map((p) => ({
          pick: `${p.season} ${ordinal(p.round)}`,
          original: teamName(p.originalRosterId),
          owner: teamName(p.ownerRosterId),
          previousOwner: p.previousOwnerRosterId != null ? teamName(p.previousOwnerRosterId) : null,
        })),
    },
    transactions: {
      count: s.transactions.length,
      byType: s.transactions.reduce<Record<string, number>>((acc, t) => {
        const k = `${t.type}:${t.status}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    },
    matchups: { weeksLoaded: s.weeks.map((w) => ({ week: w.week, complete: w.complete })) },
    freshness: s.freshness,
    issues: s.issues,
  };
}
