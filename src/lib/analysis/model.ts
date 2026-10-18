import { isUnavailable } from "@/lib/players/normalize";
import type { LeagueSnapshot, PlayerInfo, SkillPosition, Team } from "@/lib/league/models";
import { ordinal, pickId } from "@/lib/league/picks";
import type { Prefs } from "@/lib/prefs/store";
import type { ProviderStatus } from "@/lib/providers";
import { buildInternalValuation } from "@/lib/providers/internal";
import type { ValuationSet } from "@/lib/providers/types";
import { gradeFromRank, median, rankAsc, rankDesc, rankPct } from "./grades";
import { gradedPositions, lineupImpacts, optimalLineup, type LineupCandidate } from "./lineup";
import { analyzeHistory } from "@/lib/history/analyze";
import type { LeagueHistory } from "@/lib/history/load";
import type { StatsBundle } from "@/lib/stats/load";
import { computeProduction, computeProductionFromStats, round, teamWeeklyScores, type PlayerProduction } from "./production";
import { classify, NOW_WEIGHTS, STRATEGY_LABEL, type StrategyInputs } from "./strategy";
import type { LeagueModel, Need, PickView, PlayerView, PositionGrade, ProductionSummary, TeamAnalysis } from "./types";

/** Age at which each position typically starts declining (heuristic, used for "age risk"). */
export const AGE_RISK: Record<string, number> = { QB: 33, RB: 27, WR: 29, TE: 30 };
/** Extra players per position counted as depth beyond typical starters. */
const DEPTH_COUNT: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DEF: 0 };
/** Ages at or below this count toward "young core" value. */
const YOUNG_AGE = 25;


function summarize(p: PlayerProduction | undefined): ProductionSummary | null {
  if (!p) return null;
  return {
    activeWeeks: p.activeWeeks,
    total: p.total,
    ppg: p.ppg,
    adjPpg: p.adjPpg,
    last3Ppg: p.last3Ppg,
    snapShare: p.snapShare,
    snapShareLast3: p.snapShareLast3,
    snapTrend: p.snapTrend,
    oppPerGame: p.oppPerGame,
    oppLast3: p.oppLast3,
    weeksStarted: p.weeksStarted,
    weeksBenched: p.weeksBenched,
    benchPoints: p.benchPoints,
    weekly: p.weekly.map(({ week, points, started, snapShare, opportunities, played }) => ({ week, points, started, snapShare, opportunities, played })),
    source: p.source,
  };
}

function candidate(p: PlayerInfo, prod: Map<string, PlayerProduction>): LineupCandidate {
  const positions = p.fantasyPositions.length ? p.fantasyPositions : p.position ? [p.position] : [];
  return { id: p.id, positions, score: prod.get(p.id)?.adjPpg ?? 0 };
}

export type BuildModelInput = {
  snapshot: LeagueSnapshot;
  external: ValuationSet | null;
  providerStatus: ProviderStatus;
  prefs: Prefs;
  /** Weekly stats + projections for every NFL player (optional; falls back to matchups). */
  stats?: StatsBundle | null;
  trending?: { adds: Map<string, number>; drops: Map<string, number>; fetchedAt: string } | null;
  history?: LeagueHistory | null;
};

/** Turn a league snapshot into the full analytical model used by every page. */
export function buildLeagueModel({ snapshot: s, external, providerStatus, prefs, stats = null, trending = null, history = null }: BuildModelInput): LeagueModel {
  const n = s.teams.length;
  const slots = s.league.startingSlots;
  const POSITIONS = gradedPositions(slots);
  const isSkill = (pos: string | null): pos is SkillPosition => !!pos && POSITIONS.includes(pos);
  const statsSource = stats && stats.stats.size > 0 ? "stats" : "matchups";
  const production =
    statsSource === "stats" ? computeProductionFromStats(stats!.stats, s.weeks, (id) => s.players[id]?.position ?? null) : computeProduction(s.weeks);
  // Projections may include completed weeks (used for calibration); player fields use upcoming weeks only.
  const fromWeek = s.league.currentWeek ?? (s.league.lastScoredWeek ?? 0) + 1;
  const projectionWeeks = stats ? [...stats.projections.keys()].filter((w) => w >= fromWeek).sort((a, b) => a - b) : [];
  const projWeek = projectionWeeks[0] ?? null;
  const projFor = (id: string) => (projWeek != null ? (stats!.projections.get(projWeek)?.get(id)?.pts ?? null) : null);
  const projSum = (id: string, weeks: number[]) => {
    if (!weeks.length) return null;
    let sum = 0, any = false;
    for (const w of weeks) {
      const v = stats!.projections.get(w)?.get(id)?.pts;
      if (v != null) { sum += v; any = true; }
    }
    return any ? round(sum, 1) : null;
  };
  const projNextFor = (id: string) => projSum(id, projectionWeeks.slice(0, 3));
  const projRosFor = (id: string) => projSum(id, projectionWeeks);
  const scoredWeeks = s.weeks.filter((w) => w.complete).length;

  // Lineup-eligible pool excludes taxi and reserve (they cannot be started in Sleeper).
  const eligible = (t: Team) => t.roster.filter((r) => r.slot === "starter" || r.slot === "bench").map((r) => candidate(r.player, production));
  const lineups = new Map(s.teams.map((t) => [t.rosterId, optimalLineup(eligible(t), slots)]));

  // Typical starters per position, derived from every team's best lineup (generalizes across formats).
  const startersPerPosition = Object.fromEntries(
    POSITIONS.map((pos) => {
      let count = 0;
      for (const [rid, lu] of lineups) {
        const team = s.teams.find((t) => t.rosterId === rid)!;
        for (const a of lu.assignments) {
          const p = team.roster.find((r) => r.player.id === a.playerId)?.player;
          if (p?.position === pos) count++;
        }
      }
      return [pos, Math.max(1, Math.round(count / Math.max(1, n)))];
    }),
  ) as Record<SkillPosition, number>;

  // Replacement level: the best player just outside the league's collective starters at each position.
  const rostered = s.teams.flatMap((t) => t.roster.map((r) => r.player));
  const replacementPpg = Object.fromEntries(
    POSITIONS.map((pos) => {
      const scores = rostered.filter((p) => p.position === pos).map((p) => production.get(p.id)?.adjPpg ?? 0).sort((a, b) => b - a);
      return [pos, round(scores[startersPerPosition[pos] * n] ?? 0)];
    }),
  ) as Record<SkillPosition, number>;

  const valuation: ValuationSet =
    external ??
    buildInternalValuation({
      production,
      players: s.players,
      rosteredIds: rostered.map((p) => p.id),
      replacementPpg,
      pickSeasons: s.pickSeasons,
      draftRounds: s.league.draftRounds ?? 3,
      ctx: { superflex: s.league.format.superflex, receptionPoints: s.league.format.receptionPoints, teams: n },
    });
  const valueSource = valuation.kind;

  // ---- Per-team base metrics -------------------------------------------------------------
  const base = s.teams.map((t) => {
    const lu = lineups.get(t.rosterId)!;
    const impacts = lineupImpacts(eligible(t), slots);
    const inLineup = new Set(lu.assignments.map((a) => a.playerId));
    const healthy = optimalLineup(
      eligible(t).filter((c) => !isUnavailable(t.roster.find((r) => r.player.id === c.id)!.player)),
      slots,
    );
    const players: PlayerView[] = t.roster.map((r) => {
      const v = valuation.players[r.player.id];
      return {
        id: r.player.id,
        assetId: `player:${r.player.id}`,
        name: r.player.name,
        position: r.player.position,
        nflTeam: r.player.nflTeam,
        age: r.player.age,
        yearsExp: r.player.yearsExp,
        injury: r.player.injury,
        mapped: r.player.mapped,
        rosterId: t.rosterId,
        slot: r.slot,
        starterSlot: r.starterSlot,
        prod: summarize(production.get(r.player.id)),
        value: v?.value ?? null,
        redraftValue: v?.redraftValue ?? null,
        positionRank: v?.positionRank ?? null,
        valueSource,
        lineupImpact: impacts.get(r.player.id) ?? 0,
        inBestLineup: inLineup.has(r.player.id),
        ageRisk: r.player.age != null && r.player.position != null && r.player.age >= (AGE_RISK[r.player.position] ?? 99),
        tags: [],
        projWeek: projFor(r.player.id),
        projNext: projNextFor(r.player.id),
        projRos: projRosFor(r.player.id),
        trendingAdds: trending?.adds.get(r.player.id) ?? null,
      };
    });
    const byPos = (pos: SkillPosition) =>
      players.filter((p) => p.position === pos).sort((a, b) => (b.prod?.adjPpg ?? 0) - (a.prod?.adjPpg ?? 0));
    const posMetrics = Object.fromEntries(
      POSITIONS.map((pos) => {
        const list = byPos(pos);
        const active = list.filter((p) => p.slot === "starter" || p.slot === "bench");
        const k = startersPerPosition[pos];
        return [
          pos,
          {
            starterPpg: round(active.slice(0, k).reduce((a, p) => a + (p.prod?.adjPpg ?? 0), 0)),
            depthPpg: round(active.slice(k, k + (DEPTH_COUNT[pos] ?? 0)).reduce((a, p) => a + (p.prod?.adjPpg ?? 0), 0)),
            value: list.reduce((a, p) => a + (p.value ?? 0), 0),
            playerIds: list.map((p) => p.id),
          },
        ];
      }),
    ) as Record<SkillPosition, { starterPpg: number; depthPpg: number; value: number; playerIds: string[] }>;

    const playerValue = players.reduce((a, p) => a + (p.value ?? 0), 0);
    const valued = players.filter((p) => p.age != null && (p.value ?? 0) > 0);
    const vSum = valued.reduce((a, p) => a + p.value!, 0);
    const valueWeightedAge = vSum ? round(valued.reduce((a, p) => a + p.age! * p.value!, 0) / vSum, 1) : null;
    const lineupAges = players.filter((p) => p.inBestLineup && p.age != null).map((p) => p.age!);
    const lineupAvgAge = lineupAges.length ? round(lineupAges.reduce((a, b) => a + b, 0) / lineupAges.length, 1) : null;
    const ageRiskValueShare = playerValue ? round(players.filter((p) => p.ageRisk).reduce((a, p) => a + (p.value ?? 0), 0) / playerValue, 3) : 0;
    const youngValue = players.filter((p) => p.age != null && p.age <= YOUNG_AGE).reduce((a, p) => a + (p.value ?? 0), 0);
    const games = t.wins + t.losses + t.ties;
    const projected =
      projWeek != null
        ? optimalLineup(
            eligible(t)
              .filter((c) => !isUnavailable(t.roster.find((r) => r.player.id === c.id)!.player))
              .map((c) => ({ ...c, score: projFor(c.id) ?? 0 })),
            slots,
          )
        : null;
    return { t, lu, healthy, projected, players, posMetrics, playerValue, valueWeightedAge, lineupAvgAge, ageRiskValueShare, youngValue, winPct: games ? (t.wins + t.ties / 2) / games : 0 };
  });

  // Power rank is needed to estimate next year's pick slots, so compute a provisional "now" first.
  const lineupRanks = rankDesc(base.map((b) => b.lu.total));
  const pfRanks = rankDesc(base.map((b) => b.t.pointsFor));
  const hasPotential = base.every((b) => b.t.potentialPoints != null);
  const potRanks = hasPotential ? rankDesc(base.map((b) => b.t.potentialPoints!)) : null;
  const winRanks = rankDesc(base.map((b) => b.winPct));
  const provisionalNow = base.map((_, i) =>
    NOW_WEIGHTS.lineup * rankPct(lineupRanks[i], n) + NOW_WEIGHTS.pointsFor * rankPct(pfRanks[i], n) + NOW_WEIGHTS.potential * rankPct((potRanks ?? lineupRanks)[i], n) + NOW_WEIGHTS.win * rankPct(winRanks[i], n),
  );
  const powerRanks = rankDesc(provisionalNow);
  const powerByRoster = new Map(base.map((b, i) => [b.t.rosterId, powerRanks[i]]));
  const projRanks = rankDesc(base.map((b) => b.projected?.total ?? 0));
  const nameByRoster = new Map(s.teams.map((t) => [t.rosterId, t.teamName]));

  // ---- Picks -------------------------------------------------------------------------------
  const nearestSeason = s.pickSeasons[0];
  const pickViews: PickView[] = s.picks.map((p) => {
    const { value, note } = valuePick(p.season, p.round, valuation, p.season === nearestSeason ? powerByRoster.get(p.originalRosterId) ?? null : null, n);
    const orig = nameByRoster.get(p.originalRosterId) ?? `Roster ${p.originalRosterId}`;
    return {
      ...p,
      assetId: pickId(p),
      label: `${p.season} ${ordinal(p.round)}${p.slot ? ` (#${p.slot})` : ""}${p.originalRosterId !== p.ownerRosterId ? ` · via ${orig}` : ""}`,
      value,
      valueNote: note,
      valueSource,
    };
  });

  // ---- Ranks across the league ----------------------------------------------------------------
  const posRanks = Object.fromEntries(
    POSITIONS.map((pos) => [
      pos,
      {
        starter: rankDesc(base.map((b) => b.posMetrics[pos].starterPpg)),
        depth: rankDesc(base.map((b) => b.posMetrics[pos].depthPpg)),
        value: rankDesc(base.map((b) => b.posMetrics[pos].value)),
      },
    ]),
  ) as Record<SkillPosition, { starter: number[]; depth: number[]; value: number[] }>;
  const depthTotals = base.map((b) => POSITIONS.reduce((a, pos) => a + b.posMetrics[pos].depthPpg, 0));
  const depthRanks = rankDesc(depthTotals);
  const pickTotals = base.map((b) => pickViews.filter((p) => p.ownerRosterId === b.t.rosterId).reduce((a, p) => a + p.value, 0));
  const capitalRanks = rankDesc(pickTotals);
  const totalValues = base.map((b, i) => b.playerValue + pickTotals[i]);
  const valueRanks = rankDesc(totalValues);
  const youthRanks = rankAsc(base.map((b) => b.valueWeightedAge ?? 99));
  const youngValueRanks = rankDesc(base.map((b) => b.youngValue));
  const standings = [...base]
    .sort((a, b) => b.winPct - a.winPct || b.t.pointsFor - a.t.pointsFor)
    .map((b) => b.t.rosterId);

  const leagueValues = base.flatMap((b) => b.players.map((p) => p.value ?? 0)).sort((a, b) => b - a);
  const coreThreshold = leagueValues[Math.floor(leagueValues.length * 0.25)] ?? Infinity;

  // Position grade = rank of a 60/40 blend of production rank and dynasty-value rank.
  const compositeRanks = Object.fromEntries(
    POSITIONS.map((pos) => {
      const r = posRanks[pos];
      return [pos, rankDesc(base.map((_, j) => 0.6 * rankPct(r.starter[j], n) + 0.4 * rankPct(r.value[j], n)))];
    }),
  ) as Record<SkillPosition, number[]>;

  const teams: TeamAnalysis[] = base.map((b, i) => {
    const positions = Object.fromEntries(
      POSITIONS.map((pos) => {
        const r = posRanks[pos];
        const overall = gradeFromRank(compositeRanks[pos][i], n);
        const g: PositionGrade = {
          position: pos,
          starterPpg: b.posMetrics[pos].starterPpg,
          starterRank: r.starter[i],
          depthPpg: b.posMetrics[pos].depthPpg,
          depthRank: r.depth[i],
          value: b.posMetrics[pos].value,
          valueRank: r.value[i],
          overall,
          playerIds: b.posMetrics[pos].playerIds,
        };
        return [pos, g];
      }),
    ) as Record<SkillPosition, PositionGrade>;

    const myPicks = pickViews.filter((p) => p.ownerRosterId === b.t.rosterId);
    const inputs: StrategyInputs = {
      lineupPct: rankPct(lineupRanks[i], n),
      pointsForPct: rankPct(pfRanks[i], n),
      potentialPct: potRanks ? rankPct(potRanks[i], n) : null,
      winPct: rankPct(winRanks[i], n),
      youthPct: rankPct(youthRanks[i], n),
      youngValuePct: rankPct(youngValueRanks[i], n),
      capitalPct: rankPct(capitalRanks[i], n),
      totalValuePct: rankPct(valueRanks[i], n),
      scoredWeeks,
      valuationIsEstimate: valueSource === "internal-estimate",
    };
    const c = classify(inputs);
    const override = prefs.strategyOverrides[String(b.t.rosterId)] ?? null;
    const firsts = myPicks.filter((p) => p.round === 1).length;
    const seconds = myPicks.filter((p) => p.round === 2).length;
    const seasons = s.pickSeasons.length;

    const reasons = [
      `Best lineup averages ${b.lu.total.toFixed(1)} adj. PPG (${ordinal(lineupRanks[i])} of ${n}).`,
      `Record ${b.t.wins}-${b.t.losses}${b.t.ties ? `-${b.t.ties}` : ""} (${ordinal(winRanks[i])}); ${b.t.pointsFor.toFixed(1)} points for (${ordinal(pfRanks[i])})${potRanks ? `; ${b.t.potentialPoints!.toFixed(1)} potential (${ordinal(potRanks[i])})` : ""}.`,
      b.valueWeightedAge != null
        ? `Value-weighted roster age ${b.valueWeightedAge} (${ordinal(youthRanks[i])} youngest); ${Math.round(b.ageRiskValueShare * 100)}% of player value is past typical decline age.`
        : "Roster age could not be value-weighted (no valuation data).",
      `${firsts} first-round and ${seconds} second-round picks over ${seasons} seasons (${ordinal(capitalRanks[i])} in draft capital; baseline is ${seasons} of each).`,
      `Total asset value ${ordinal(valueRanks[i])} in the league${valueSource === "internal-estimate" ? " (internal estimate)" : ""}.`,
    ];
    if (c.strategy === "rebuild" && c.now > 0.38) reasons.push("Middling current strength with an older roster and limited future capital points toward selling rather than buying.");
    if (scoredWeeks < 4) reasons.push(`Only ${scoredWeeks} scored weeks so far, so confidence is reduced.`);

    // Tags, needs, surplus
    for (const p of b.players) {
      if (p.inBestLineup && (p.value ?? 0) >= coreThreshold) p.tags.push("Core");
      else if (p.inBestLineup) p.tags.push("Starter");
      if (!p.inBestLineup && p.slot !== "taxi" && p.slot !== "reserve" && (p.value ?? 0) >= 1000) p.tags.push("Expendable");
      if (p.slot === "taxi") p.tags.push("Taxi stash");
      if (p.ageRisk) p.tags.push("Age risk");
      if (p.injury && isUnavailable({ injury: p.injury } as PlayerInfo)) p.tags.push("Unavailable");
      if (p.slot !== "taxi" && (p.prod?.activeWeeks ?? 0) < 2 && scoredWeeks >= 2) p.tags.push("Low sample");
    }

    const needs: Need[] = POSITIONS.flatMap((pos) => {
      const g = positions[pos];
      if (g.starterRank < Math.ceil(n * 2 / 3)) return [];
      const leagueMed = median(base.map((x) => x.posMetrics[pos].starterPpg));
      return [{
        position: pos,
        severity: round((g.starterRank - Math.ceil(n * 2 / 3) + 1) / (n - Math.ceil(n * 2 / 3) + 1), 2),
        reason: `${pos} starters produce ${g.starterPpg.toFixed(1)} adj. PPG vs league median ${leagueMed.toFixed(1)} (${ordinal(g.starterRank)} of ${n}).`,
      }];
    }).sort((a, b2) => b2.severity - a.severity);

    const surplusIds = b.players
      .filter((p) => !p.inBestLineup && p.slot !== "reserve" && (p.value ?? 0) >= 1500 && isSkill(p.position) && positions[p.position].depthRank <= Math.ceil(n / 3))
      .map((p) => p.id);

    const strengths = POSITIONS.filter((pos) => positions[pos].overall.rank <= Math.ceil(n / 4)).map(
      (pos) => `${pos}: ${positions[pos].overall.grade} (${ordinal(positions[pos].starterRank)} in production, ${ordinal(positions[pos].valueRank)} in value)`,
    );
    const weaknesses = POSITIONS.filter((pos) => positions[pos].overall.rank > n - Math.ceil(n / 3)).map(
      (pos) => `${pos}: ${positions[pos].overall.grade} (${ordinal(positions[pos].starterRank)} in production, ${ordinal(positions[pos].valueRank)} in value)`,
    );

    const { roster: _roster, ...team } = b.t;
    void _roster;
    return {
      team,
      players: b.players,
      picks: myPicks,
      lineup: { assignments: b.lu.assignments, total: b.lu.total, rank: lineupRanks[i] },
      injuryAdjustedLineupTotal: b.healthy.total,
      projectedLineup: b.projected && projWeek != null ? { week: projWeek, assignments: b.projected.assignments, total: b.projected.total, rank: projRanks[i] } : null,
      positions,
      depth: gradeFromRank(depthRanks[i], n),
      capital: { ...gradeFromRank(capitalRanks[i], n), value: pickTotals[i], firsts, seconds, total: myPicks.length },
      age: { valueWeighted: b.valueWeightedAge, lineupAvg: b.lineupAvgAge, ageRiskValueShare: b.ageRiskValueShare, youthRank: youthRanks[i] },
      totals: { playerValue: b.playerValue, pickValue: pickTotals[i], totalValue: totalValues[i], valueRank: valueRanks[i] },
      strengths,
      weaknesses,
      needs,
      surplusIds,
      strategy: {
        inferred: c.strategy,
        confidence: c.confidence,
        nowScore: round(c.now, 3),
        futureScore: round(c.future, 3),
        reasons: [`Classified as ${STRATEGY_LABEL[c.strategy]} (current-strength score ${Math.round(c.now * 100)}/100, future score ${Math.round(c.future * 100)}/100).`, ...reasons],
        override,
        effective: override ?? c.strategy,
      },
      powerRank: powerRanks[i],
      standingRank: standings.indexOf(b.t.rosterId) + 1,
    };
  });

  // ---- Free agents: every unrostered QB/RB/WR/TE with any real signal --------------------------
  // (production this season, a projection, a third-party value, or Sleeper-wide add activity).
  const rosteredIds = new Set(rostered.map((p) => p.id));
  const candidateIds = new Set<string>([
    ...[...production.keys()].filter((id) => (production.get(id)!.activeWeeks ?? 0) > 0),
    ...(projWeek != null ? [...(stats!.projections.get(projWeek)?.entries() ?? [])].filter(([, l]) => l.pts > 0).map(([id]) => id) : []),
    ...(valueSource === "third-party" ? Object.keys(valuation.players) : []),
    ...(trending ? [...trending.adds.keys()] : []),
  ]);
  const freeAgents: PlayerView[] = [];
  for (const id of candidateIds) {
    const p = s.players[id];
    if (!p || rosteredIds.has(id) || !isSkill(p.position)) continue;
    const v = valueSource === "third-party" ? valuation.players[id] : undefined;
    // Players without an NFL team are only kept when a valuation source still values them.
    if (!p.nflTeam && !v) continue;
    freeAgents.push({
      id, assetId: `player:${id}`, name: p.name, position: p.position, nflTeam: p.nflTeam, age: p.age, yearsExp: p.yearsExp,
      injury: p.injury, mapped: true, rosterId: null, slot: null, starterSlot: null, prod: summarize(production.get(id)),
      value: v?.value ?? null, redraftValue: v?.redraftValue ?? null, positionRank: v?.positionRank ?? null, valueSource, lineupImpact: 0,
      inBestLineup: false, ageRisk: p.age != null && p.age >= (AGE_RISK[p.position ?? ""] ?? 99), tags: ["Free agent"],
      projWeek: projFor(id), projNext: projNextFor(id), projRos: projRosFor(id), trendingAdds: trending?.adds.get(id) ?? null,
    });
  }
  freeAgents.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.prod?.ppg ?? 0) - (a.prod?.ppg ?? 0));

  const playerNames: LeagueModel["playerNames"] = {};
  for (const tx of s.transactions) {
    for (const m of [...tx.adds, ...tx.drops]) {
      const p = s.players[m.playerId];
      playerNames[m.playerId] = { name: p?.name ?? `Unknown player (${m.playerId})`, position: p?.position ?? null, nflTeam: p?.nflTeam ?? null };
    }
  }

  return {
    generatedAt: s.generatedAt,
    league: s.league,
    verification: s.verification,
    freshness: s.freshness,
    issues: s.issues,
    myRosterId: s.verification.myRosterId,
    teams,
    standings,
    valuation: { label: valuation.label, kind: valuation.kind, description: valuation.description, fetchedAt: valuation.fetchedAt, status: providerStatus },
    startersPerPosition,
    replacementPpg,
    freeAgents,
    weekly: teamWeeklyScores(s.weeks),
    transactions: s.transactions,
    pickSeasons: s.pickSeasons,
    playerNames,
    scoredWeeks,
    statsSource,
    gradedPositions: POSITIONS,
    projectionWeeks: projectionWeeks.slice(0, 3),
    odds: null,
    modelCheck: null,
    trendingFetchedAt: trending?.fetchedAt ?? null,
    history: history
      ? analyzeHistory(history, {
          currentSeason: s.league.season,
          currentLeagueId: s.league.id,
          currentTransactions: s.transactions,
          teams: s.teams.map((t) => ({ rosterId: t.rosterId, ownerId: t.ownerId, name: t.teamName })),
          player: (id) => {
            const p = s.players[id];
            return { name: p?.name ?? `Unknown player (${id})`, position: p?.position ?? null, value: valuation.players[id]?.value ?? null };
          },
          futurePick: (season, round, originalOwnerId) => {
            const rid = s.teams.find((t) => t.ownerId === originalOwnerId)?.rosterId;
            const pv = pickViews.find((p) => p.season === season && p.round === round && p.originalRosterId === rid);
            return pv ? { label: pv.label, value: pv.value } : null;
          },
        })
      : null,
  };
}

/**
 * Value a draft pick from the valuation set. For the nearest draft, the slot bucket (early/mid/late)
 * is estimated from the original team's current power rank; later seasons use generic round values.
 */
export function valuePick(
  season: string,
  round: number,
  set: ValuationSet,
  originalPowerRank: number | null,
  teams: number,
): { value: number; note: string } {
  const forSeason = set.picks.filter((p) => p.season === season && p.round === round);
  if (forSeason.length) {
    if (originalPowerRank != null) {
      const bucket = originalPowerRank > (teams * 2) / 3 ? "early" : originalPowerRank > teams / 3 ? "mid" : "late";
      const b = forSeason.find((p) => p.bucket === bucket);
      if (b) return { value: b.value, note: `${set.label} ${bucket}-round value; slot estimated from original team's power rank (${ordinal(originalPowerRank)}).` };
    }
    const generic = forSeason.find((p) => p.bucket == null) ?? forSeason[0];
    return { value: generic.value, note: `${set.label} generic ${season} round-${round} value (slot unknown).` };
  }
  // Season not covered by the source: extrapolate from the latest covered season, discounted 10%/yr.
  const covered = set.picks.filter((p) => p.round === round && p.bucket == null).sort((a, b) => Number(b.season) - Number(a.season))[0];
  if (covered) {
    const years = Math.max(0, Number(season) - Number(covered.season));
    return { value: Math.round(covered.value * 0.9 ** years), note: `Extrapolated from ${set.label} ${covered.season} round-${round} value (−10%/yr).` };
  }
  return { value: 0, note: `No ${set.label} value for round ${round} picks.` };
}
