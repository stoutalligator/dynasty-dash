import type { SleeperLeague, SleeperMatchup, SleeperTransaction } from "@/lib/sleeper/schemas";
import type { LeagueFormat, LeagueInfo, MatchupEntry, Transaction } from "./models";

export function describeFormat(league: SleeperLeague): LeagueFormat {
  const slots = league.roster_positions;
  const qbStartSlots = slots.filter((s) => s === "QB").length;
  const superflex = slots.includes("SUPER_FLEX");
  const rec = league.scoring_settings.rec ?? 0;
  const tePremium = league.scoring_settings.bonus_rec_te ?? 0;
  const pprLabel = rec === 1 ? "PPR" : rec === 0.5 ? "Half PPR" : rec === 0 ? "Standard" : `${rec} PPR`;
  return {
    superflex,
    qbStartSlots,
    receptionPoints: rec,
    tePremium,
    scoringLabel: tePremium > 0 ? `${pprLabel} + ${tePremium} TEP` : pprLabel,
  };
}

export function normalizeLeague(league: SleeperLeague): LeagueInfo {
  const s = league.settings;
  const startingSlots = league.roster_positions.filter((p) => p !== "BN");
  const meta = league.metadata ?? {};
  const divisions = Array.from({ length: s.divisions ?? 0 }, (_, i) => ({
    id: i + 1,
    name: meta[`division_${i + 1}`] ?? `Division ${i + 1}`,
    avatarUrl: meta[`division_${i + 1}_avatar`] ?? null,
  }));
  return {
    id: league.league_id,
    name: league.name,
    season: league.season,
    status: league.status,
    seasonType: league.season_type ?? null,
    totalRosters: league.total_rosters,
    avatarUrl: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
    rosterPositions: league.roster_positions,
    startingSlots,
    benchSlots: league.roster_positions.filter((p) => p === "BN").length,
    taxiSlots: s.taxi_slots ?? 0,
    reserveSlots: s.reserve_slots ?? 0,
    draftRounds: s.draft_rounds ?? null,
    playoffTeams: s.playoff_teams ?? null,
    playoffWeekStart: s.playoff_week_start ?? null,
    tradeDeadline: s.trade_deadline ?? null,
    leagueType: s.type ?? null,
    waiverBudget: s.waiver_budget ?? null,
    waiverType: typeof s.waiver_type === "number" ? s.waiver_type : null,
    currentWeek: s.leg ?? null,
    lastScoredWeek: s.last_scored_leg ?? null,
    medianGame: s.league_average_match === 1,
    playoffRoundType: typeof s.playoff_round_type === "number" ? s.playoff_round_type : null,
    divisions,
    format: describeFormat(league),
    scoringSettings: league.scoring_settings,
    previousLeagueId: league.previous_league_id ?? null,
    draftId: league.draft_id ?? null,
  };
}

export function normalizeTransaction(t: SleeperTransaction): Transaction {
  return {
    id: t.transaction_id,
    type: t.type,
    status: t.status,
    createdAt: t.status_updated ?? t.created,
    week: t.leg ?? null,
    rosterIds: t.roster_ids,
    adds: Object.entries(t.adds ?? {}).map(([playerId, rosterId]) => ({ playerId, rosterId })),
    drops: Object.entries(t.drops ?? {}).map(([playerId, rosterId]) => ({ playerId, rosterId })),
    picks: (t.draft_picks ?? []).map((p) => ({
      season: p.season,
      round: p.round,
      originalRosterId: p.roster_id,
      fromRosterId: p.previous_owner_id ?? null,
      toRosterId: p.owner_id,
    })),
    faab: (t.waiver_budget ?? []).map((w) => ({ from: w.sender, to: w.receiver, amount: w.amount })),
    waiverBid: t.settings?.waiver_bid ?? null,
  };
}

export function normalizeMatchup(m: SleeperMatchup): MatchupEntry {
  return {
    rosterId: m.roster_id,
    matchupId: m.matchup_id,
    points: m.custom_points ?? m.points ?? 0,
    starters: m.starters ?? [],
    startersPoints: m.starters_points ?? [],
    playersPoints: m.players_points ?? {},
  };
}
