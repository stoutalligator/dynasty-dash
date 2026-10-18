import type { ScheduledWeek } from "@/lib/league/models";

/**
 * Monte Carlo season simulation: remaining regular-season games (head-to-head plus the optional
 * league-median game), playoff seeding, and a playoff bracket. Each team's weekly score is drawn
 * from Normal(mean for that week, sd). A seeded generator gives common random numbers, so a
 * baseline and a "what if" run differ only because of the roster change being tested.
 */

export type SimTeam = {
  rosterId: number;
  division: number | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Expected score by week (regular season and playoff weeks). */
  weekMeans: Map<number, number>;
};

export type SimInput = {
  teams: SimTeam[];
  /** Remaining regular-season weeks with head-to-head pairings. */
  schedule: ScheduledWeek[];
  playoffWeeks: number[];
  playoffTeams: number;
  medianGame: boolean;
  /** Division winners qualify and take the top seeds (Sleeper's default with divisions). */
  divisionWinnersSeedFirst: boolean;
  weeksPerRound: number;
  sd: number;
};

export type TeamOdds = {
  rosterId: number;
  playoffPct: number;
  byePct: number;
  finalPct: number;
  titlePct: number;
  avgWins: number;
  avgSeed: number | null;
};

/** mulberry32: small, fast, seedable PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(next: () => number) {
  let u = 0;
  while (u === 0) u = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

type Standing = { idx: number; wins: number; pf: number; division: number | null };
const byRecord = (a: Standing, b: Standing) => b.wins - a.wins || b.pf - a.pf;

/** Order playoff seeds: optional division winners first, then best remaining records. */
export function seedTeams(standings: Standing[], playoffTeams: number, divisionWinnersFirst: boolean): number[] {
  const sorted = [...standings].sort(byRecord);
  if (!divisionWinnersFirst || !standings.some((s) => s.division != null)) return sorted.slice(0, playoffTeams).map((s) => s.idx);
  const winners = new Map<number, Standing>();
  for (const s of sorted) if (s.division != null && !winners.has(s.division)) winners.set(s.division, s);
  const top = [...winners.values()].sort(byRecord);
  const rest = sorted.filter((s) => !top.includes(s));
  return [...top, ...rest].slice(0, playoffTeams).map((s) => s.idx);
}

export function simulateSeason(input: SimInput, runs: number, seed = 20_261_018): TeamOdds[] {
  const n = input.teams.length;
  const order = input.teams.map((t, i) => ({ t, i })).sort((a, b) => a.t.rosterId - b.t.rosterId);
  const idxByRoster = new Map(input.teams.map((t, i) => [t.rosterId, i]));
  const madePlayoffs = new Float64Array(n);
  const bye = new Float64Array(n);
  const final = new Float64Array(n);
  const title = new Float64Array(n);
  const winsSum = new Float64Array(n);
  const seedSum = new Float64Array(n);

  const size = 2 ** Math.ceil(Math.log2(Math.max(2, input.playoffTeams)));
  const byes = size - input.playoffTeams;
  const rounds = Math.log2(size);
  const meanFor = (i: number, week: number) => {
    const m = input.teams[i].weekMeans;
    return m.get(week) ?? m.get([...m.keys()].sort((a, b) => b - a)[0]) ?? 0;
  };

  const wins = new Float64Array(n);
  const pf = new Float64Array(n);
  const scores = new Float64Array(n);

  for (let r = 0; r < runs; r++) {
    const next = rng(seed + r * 7919);
    for (let i = 0; i < n; i++) {
      wins[i] = input.teams[i].wins + input.teams[i].ties / 2;
      pf[i] = input.teams[i].pointsFor;
    }
    for (const wk of input.schedule) {
      // Draw in roster-id order so the same team gets the same random draw across scenarios.
      for (const { i } of order) scores[i] = meanFor(i, wk.week) + input.sd * normal(next);
      for (const [a, b] of wk.pairs) {
        const ia = idxByRoster.get(a);
        const ib = idxByRoster.get(b);
        if (ia == null || ib == null) continue;
        if (scores[ia] > scores[ib]) wins[ia]++;
        else wins[ib]++;
      }
      if (input.medianGame) {
        const sorted = Array.from(scores).sort((x, y) => y - x);
        const cut = sorted[Math.floor(n / 2) - 1];
        for (let i = 0; i < n; i++) if (scores[i] >= cut) wins[i]++;
      }
      for (let i = 0; i < n; i++) pf[i] += scores[i];
    }

    const seeds = seedTeams(
      input.teams.map((t, i) => ({ idx: i, wins: wins[i], pf: pf[i], division: t.division })),
      input.playoffTeams,
      input.divisionWinnersSeedFirst,
    );
    seeds.forEach((idx, s) => {
      madePlayoffs[idx]++;
      seedSum[idx] += s + 1;
      if (s < byes) bye[idx]++;
    });
    for (let i = 0; i < n; i++) winsSum[i] += wins[i];

    // Bracket: byes for top seeds, then highest remaining seed plays lowest each round.
    const rank = (i: number) => seeds.indexOf(i);
    let alive = seeds.slice();
    for (let round = 0; round < rounds; round++) {
      if (alive.length === 2) for (const i of alive) final[i]++;
      const weeks = input.playoffWeeks.slice(round * input.weeksPerRound, round * input.weeksPerRound + input.weeksPerRound);
      const draw = (i: number) => {
        let sc = 0;
        for (const w of weeks.length ? weeks : [input.playoffWeeks.at(-1) ?? 17]) sc += meanFor(i, w) + input.sd * normal(next);
        return sc;
      };
      const resting = round === 0 ? alive.slice(0, byes) : [];
      const field = round === 0 ? alive.slice(byes) : alive;
      const winners: number[] = [];
      for (let k = 0; k < field.length / 2; k++) {
        const hi = field[k];
        const lo = field[field.length - 1 - k];
        winners.push(draw(hi) >= draw(lo) ? hi : lo);
      }
      alive = [...resting, ...winners].sort((x, y) => rank(x) - rank(y));
    }
    if (alive.length === 1) title[alive[0]]++;
  }

  return input.teams.map((t, i) => ({
    rosterId: t.rosterId,
    playoffPct: madePlayoffs[i] / runs,
    byePct: bye[i] / runs,
    finalPct: final[i] / runs,
    titlePct: title[i] / runs,
    avgWins: winsSum[i] / runs,
    avgSeed: madePlayoffs[i] ? seedSum[i] / madePlayoffs[i] : null,
  }));
}
