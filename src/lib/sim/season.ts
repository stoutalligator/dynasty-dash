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

/** Odds for one team split by the result of its next head-to-head game (filled in by simulateSeason). */
export type Stakes = { rosterId: number; week: number; opponentRosterId: number; ifWin: StakeBranch; ifLose: StakeBranch };
export type StakeBranch = { runs: number; playoffPct: number; titlePct: number; byePct: number };

export function simulateSeason(input: SimInput, runs: number, seed = 20_261_018, focus?: { rosterId: number; week?: number; result?: Stakes }): TeamOdds[] {
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
  // Precomputed per-week means and pair indices: the loop below runs runs × weeks × teams times.
  const regMeans = input.schedule.map((wk) => Float64Array.from({ length: n }, (_, i) => meanFor(i, wk.week)));
  const regPairs = input.schedule.map((wk) =>
    wk.pairs.flatMap(([a, b]) => {
      const ia = idxByRoster.get(a);
      const ib = idxByRoster.get(b);
      return ia == null || ib == null ? [] : [[ia, ib] as const];
    }),
  );
  const playoffMeans = new Map<number, Float64Array>();
  for (const w of [...input.playoffWeeks, 17]) playoffMeans.set(w, Float64Array.from({ length: n }, (_, i) => meanFor(i, w)));
  const drawOrder = order.map((o) => o.i);
  // "What's at stake": the focus team's first scheduled head-to-head, and outcomes by its result.
  const focusIdx = focus ? idxByRoster.get(focus.rosterId) : undefined;
  const focusW = focus?.week != null ? input.schedule.findIndex((s) => s.week === focus.week) : 0;
  const focusPair = focusIdx != null && focusW >= 0 ? regPairs[focusW]?.find(([a, b]) => a === focusIdx || b === focusIdx) : undefined;
  const branch = { win: { runs: 0, playoff: 0, title: 0, bye: 0 }, lose: { runs: 0, playoff: 0, title: 0, bye: 0 } };
  let focusWon = false;
  const medianRank = n - Math.floor(n / 2); // ascending index of the (n/2)-th highest score

  const wins = new Float64Array(n);
  const pf = new Float64Array(n);
  const scores = new Float64Array(n);
  const sorted = new Float64Array(n);

  for (let r = 0; r < runs; r++) {
    const next = rng(seed + r * 7919);
    for (let i = 0; i < n; i++) {
      wins[i] = input.teams[i].wins + input.teams[i].ties / 2;
      pf[i] = input.teams[i].pointsFor;
    }
    for (let w = 0; w < regMeans.length; w++) {
      const means = regMeans[w];
      // Draw in roster-id order so the same team gets the same random draw across scenarios.
      for (const i of drawOrder) scores[i] = means[i] + input.sd * normal(next);
      for (const [ia, ib] of regPairs[w]) {
        if (scores[ia] > scores[ib]) wins[ia]++;
        else wins[ib]++;
      }
      if (w === focusW && focusPair) focusWon = scores[focusIdx!] > scores[focusPair[0] === focusIdx ? focusPair[1] : focusPair[0]];
      if (input.medianGame) {
        sorted.set(scores);
        sorted.sort();
        const cut = sorted[medianRank];
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
        for (const w of weeks.length ? weeks : [input.playoffWeeks.at(-1) ?? 17]) sc += playoffMeans.get(w)![i] + input.sd * normal(next);
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
    if (focusPair) {
      const b = focusWon ? branch.win : branch.lose;
      b.runs++;
      const s = seeds.indexOf(focusIdx!);
      if (s >= 0) b.playoff++;
      if (s >= 0 && s < byes) b.bye++;
      if (alive.length === 1 && alive[0] === focusIdx) b.title++;
    }
  }
  if (focus && focusPair) {
    const toBranch = (x: typeof branch.win): StakeBranch => ({ runs: x.runs, playoffPct: x.runs ? x.playoff / x.runs : 0, titlePct: x.runs ? x.title / x.runs : 0, byePct: x.runs ? x.bye / x.runs : 0 });
    focus.result = {
      rosterId: focus.rosterId,
      week: input.schedule[focusW].week,
      opponentRosterId: input.teams[focusPair[0] === focusIdx ? focusPair[1] : focusPair[0]].rosterId,
      ifWin: toBranch(branch.win),
      ifLose: toBranch(branch.lose),
    };
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
