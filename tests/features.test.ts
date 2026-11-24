import { describe, expect, it } from "vitest";
import type { PlayerView, TeamAnalysis } from "@/lib/analysis/types";
import { faabMarket, suggestedBid } from "@/lib/analysis/faab";
import { headToHead } from "@/lib/history/h2h";
import type { Transaction, WeekResult } from "@/lib/league/models";
import { simulateSeason, type SimInput, type Stakes } from "@/lib/sim/season";
import { rankMovement, snapshotOf } from "@/lib/snapshots/store";
import { teamAssets } from "@/lib/trades/assets";
import { suggestCounters } from "@/lib/trades/counter";
import { evaluateTrade } from "@/lib/trades/evaluate";
import { normalCdf, startSit } from "@/lib/week/this-week";
import { model } from "./league-fixture";

const pv = (id: string, position: string, slot: "starter" | "bench", starterSlot: string | null, projWeek: number | null, extra: Partial<PlayerView> = {}) =>
  ({ id, name: id, position, slot, starterSlot, projWeek, onBye: false, injury: null, ...extra }) as unknown as PlayerView;

describe("startSit", () => {
  const team = {
    players: [
      pv("qb", "QB", "starter", "QB", 20),
      pv("wr1", "WR", "starter", "WR", 6),
      pv("wr2", "WR", "bench", null, 14),
      pv("rb", "RB", "starter", "RB", 0, { onBye: true }),
      pv("rb2", "RB", "bench", null, 9),
    ],
    projectedLineup: {
      week: 11,
      total: 43,
      rank: 1,
      assignments: [
        { slot: "QB", playerId: "qb", score: 20 },
        { slot: "WR", playerId: "wr2", score: 14 },
        { slot: "RB", playerId: "rb2", score: 9 },
      ],
    },
  } as unknown as TeamAnalysis;

  it("lists the swaps to the best projected lineup and flags a starter on bye", () => {
    const r = startSit(team)!;
    expect(r.currentTotal).toBe(26);
    expect(r.gain).toBe(17);
    expect(r.swaps.map((s) => [s.start.id, s.bench?.id, s.gain])).toEqual([
      ["wr2", "wr1", 8],
      ["rb2", "rb", 9],
    ]);
    expect(r.problems).toEqual([expect.objectContaining({ reason: "bye" })]);
  });

  it("skips swaps involving players who already played", () => {
    const r = startSit(team, new Set(["wr1"]))!;
    expect(r.swaps.map((s) => s.start.id)).toEqual(["rb2"]);
    expect(r.locked).toBe(1);
  });
});

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe("headToHead", () => {
  const wk = (week: number, a: [number, number], b: [number, number], complete = true): WeekResult => ({
    week,
    complete,
    entries: [
      { rosterId: a[0], matchupId: 1, points: a[1], starters: [], startersPoints: [], playersPoints: {} },
      { rosterId: b[0], matchupId: 1, points: b[1], starters: [], startersPoints: [], playersPoints: {} },
    ],
  });
  it("matches managers across seasons by owner and separates this season", () => {
    const r = headToHead({
      // Last season the owners held different roster ids.
      pastSeasons: [{ weeks: [wk(1, [7, 120], [8, 100])], rosterOwner: { 7: "u1", 8: "u2" } }],
      currentWeeks: [wk(1, [1, 90], [2, 110]), wk(2, [1, 130], [2, 100], false)],
      currentTeams: [{ rosterId: 1, ownerId: "u1" }, { rosterId: 2, ownerId: "u2" }],
    });
    expect(r[1][2]).toMatchObject({ wins: 1, losses: 1, ties: 0, pointsFor: 210, thisSeason: { wins: 0, losses: 1, ties: 0 } });
    expect(r[2][1]).toMatchObject({ wins: 1, losses: 1 });
  });
});

describe("FAAB market", () => {
  const tx = (bid: number, status = "complete", type = "waiver") =>
    ({ id: String(bid), type, status, createdAt: bid, week: 1, rosterIds: [1], adds: [{ playerId: "p" + bid, rosterId: 1 }], drops: [], picks: [], faab: [], waiverBid: bid }) as unknown as Transaction;
  it("uses only successful claims and prices tiers from percentiles", () => {
    const m = faabMarket([{ season: "2026", transactions: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((b) => tx(b)).concat([tx(500, "failed")]) }])!;
    expect(m.bids).toHaveLength(10);
    expect(m.max).toBe(89);
    expect(suggestedBid(m, "Strong add", 200)).toEqual({ low: m.p75, high: m.p90 });
    expect(suggestedBid(m, "Strong add", 10)!.high).toBeLessThanOrEqual(10);
    expect(suggestedBid(m, "Monitor", 200)).toBeNull();
  });
  it("needs a few bids to say anything", () => {
    expect(faabMarket([{ season: "2026", transactions: [tx(5), tx(6)] }])).toBeNull();
  });
});

describe("stakes", () => {
  const input: SimInput = {
    teams: [1, 2, 3, 4].map((rosterId, i) => ({ rosterId, division: null, wins: 5, losses: 5, ties: 0, pointsFor: 1000, weekMeans: new Map([[12, 100 + i], [13, 100], [15, 100], [16, 100]]) })),
    schedule: [{ week: 12, pairs: [[1, 2], [3, 4]] }, { week: 13, pairs: [[1, 3], [2, 4]] }],
    playoffWeeks: [15, 16],
    playoffTeams: 2,
    medianGame: false,
    divisionWinnersSeedFirst: false,
    weeksPerRound: 1,
    sd: 20,
  };
  it("splits my odds by the result of my next game without changing the odds", () => {
    const focus: { rosterId: number; result?: Stakes } = { rosterId: 1 };
    const withFocus = simulateSeason(input, 2000, undefined, focus);
    expect(withFocus).toEqual(simulateSeason(input, 2000));
    const s = focus.result!;
    expect(s).toMatchObject({ week: 12, opponentRosterId: 2 });
    expect(s.ifWin.runs + s.ifLose.runs).toBe(2000);
    expect(s.ifWin.playoffPct).toBeGreaterThan(s.ifLose.playoffPct);
  });
});

describe("counter-offers", () => {
  const asset = (rid: number, id: string) => teamAssets(model.teams.find((t) => t.team.rosterId === rid)!).find((a) => a.assetId === `player:${id}`)!;
  it("adds one of my pieces when the partner would decline", () => {
    const args = { myRosterId: 1, partnerRosterId: 2, myGives: [asset(1, "a-qb2")], theirGives: [asset(2, "b-rb1")], objective: "contender" as const };
    expect(evaluateTrade(model, args).partner.score).toBeLessThan(0);
    const counters = suggestCounters(model, args);
    expect(counters.length).toBeGreaterThan(0);
    for (const c of counters) {
      expect(c.kind === "add-mine" || c.kind === "remove-theirs").toBe(true);
      expect(c.evaluation.partner.score).toBeGreaterThanOrEqual(0);
      expect(c.evaluation.mine.score).toBeGreaterThan(0);
    }
  });
  it("asks for more when the deal is bad for me", () => {
    const args = { myRosterId: 1, partnerRosterId: 2, myGives: [asset(1, "a-qb1")], theirGives: [asset(2, "b-qb1")], objective: "contender" as const };
    expect(evaluateTrade(model, args).mine.score).toBeLessThanOrEqual(0);
    const counters = suggestCounters(model, args);
    expect(counters.length).toBeGreaterThan(0);
    for (const c of counters) {
      expect(c.kind === "add-theirs" || c.kind === "remove-mine").toBe(true);
      expect(c.evaluation.mine.score).toBeGreaterThan(0);
      expect(c.evaluation.partner.score).toBeGreaterThanOrEqual(-0.5);
    }
  });
});

describe("snapshots", () => {
  it("reports power-rank movement against a week-old snapshot", () => {
    const old = snapshotOf(model, "2000-01-01");
    old.teams = old.teams.map((t) => ({ ...t, powerRank: t.rosterId === 1 ? t.powerRank + 2 : t.powerRank }));
    const moves = rankMovement([old], model);
    expect(moves.get(1)).toBe(2);
    expect(rankMovement([snapshotOf(model)], model).size).toBe(0);
  });
});

describe("strategy-aware trade values", () => {
  // Their TE1 is out for the season: no rest-of-season projection.
  const hurt = {
    ...model,
    teams: model.teams.map((t) =>
      t.team.rosterId !== 2
        ? t
        : { ...t, players: t.players.map((p) => (p.id === "b-te1" ? { ...p, injury: { status: "IR", bodyPart: "Knee", notes: null, practice: null }, rosPpg: 0, tags: [...p.tags, "Unavailable"] } : p)) },
    ),
  };
  const asset = (rid: number, id: string) => teamAssets(hurt.teams.find((t) => t.team.rosterId === rid)!).find((a) => a.assetId === `player:${id}`)!;
  const args = (objective: "contender" | "retool" | "rebuild") => ({ myRosterId: 1, partnerRosterId: 2, myGives: [asset(1, "a-rb2")], theirGives: [asset(2, "b-te1")], objective });

  it("a contender gets no lineup help from a player out for the season", () => {
    const e = evaluateTrade(hurt, args("contender"));
    expect(e.mine.lens).toBe("rest-of-season");
    expect(e.mine.lineupDelta).toBeLessThanOrEqual(0);
    expect(e.mine.reasonsAgainst.join(" ")).toMatch(/ruled out/);
  });

  it("a rebuilder treats the injury as a possible buy-low", () => {
    const e = evaluateTrade(hurt, args("rebuild"));
    expect(e.mine.lens).toBe("production");
    expect(e.mine.reasonsFor.join(" ")).toMatch(/buy-low/);
  });

  it("scores the same trade lower for a contender than before the injury", () => {
    const healthy = evaluateTrade(model, { ...args("contender"), myGives: [teamAssets(model.teams.find((t) => t.team.rosterId === 1)!).find((a) => a.assetId === "player:a-rb2")!], theirGives: [teamAssets(model.teams.find((t) => t.team.rosterId === 2)!).find((a) => a.assetId === "player:b-te1")!] });
    expect(evaluateTrade(hurt, args("contender")).mine.score).toBeLessThan(healthy.mine.score);
  });
});

describe("form PPG", () => {
  it("weights recent games more but keeps a season prior", async () => {
    const { formPpg } = await import("@/lib/analysis/production");
    const rising = formPpg([5, 5, 5, 5, 20, 20, 20], 11.4);
    expect(rising).toBeGreaterThan(11.4);
    expect(rising).toBeLessThan(20);
    expect(formPpg([10, 10, 10], 10)).toBeCloseTo(10, 5);
    // One huge game can't dominate a small sample.
    expect(formPpg([40], 20)).toBeLessThan(31);
    expect(formPpg([], 0)).toBe(0);
  });
});

describe("trend detection", () => {
  const prod = (games: [number, number | null, number | null][]) =>
    ({ weekly: games.map(([points, snapShare, opportunities], i) => ({ week: i + 1, points, snapShare, opportunities, played: true, started: null, rosterId: null })) }) as never;
  it("calls a role change only when usage moves with production", async () => {
    const { detectTrend } = await import("@/lib/analysis/trends");
    expect(detectTrend(prod([[4, 0.4, 5], [5, 0.4, 5], [4, 0.45, 6], [18, 0.7, 14], [20, 0.72, 15], [19, 0.75, 15]]))?.kind).toBe("rising-role");
    expect(detectTrend(prod([[4, 0.6, 8], [5, 0.6, 8], [4, 0.6, 8], [18, 0.6, 8], [20, 0.6, 8], [19, 0.6, 8]]))?.kind).toBe("hot-streak");
    expect(detectTrend(prod([[18, 0.8, 15], [17, 0.8, 15], [19, 0.8, 14], [6, 0.6, 7], [5, 0.55, 6], [7, 0.6, 7]]))?.kind).toBe("shrinking-role");
    // Mixed signals (snaps down, touches up) are not a role change.
    expect(detectTrend(prod([[4, 0.8, 5], [5, 0.8, 5], [4, 0.8, 6], [18, 0.6, 14], [20, 0.6, 15], [19, 0.6, 15]]))?.kind).toBe("hot-streak");
    expect(detectTrend(prod([[10, 0.6, 8], [10, 0.6, 8], [11, 0.6, 8], [10, 0.6, 8]]))).toBeNull();
  });
});

describe("per-team spread", () => {
  it("shrinks a team's own spread toward the league's", async () => {
    const { teamWeeklySds } = await import("@/lib/sim/context");
    const wk = (week: number, a: number, b: number) => ({ week, complete: true, entries: [{ rosterId: 1, matchupId: 1, points: a, starters: [], startersPoints: [], playersPoints: {} }, { rosterId: 2, matchupId: 1, points: b, starters: [], startersPoints: [], playersPoints: {} }] });
    const sds = teamWeeklySds([wk(1, 100, 60), wk(2, 101, 160), wk(3, 99, 80), wk(4, 100, 150)], 25);
    expect(sds.get(1)!).toBeLessThan(25);
    expect(sds.get(2)!).toBeGreaterThan(25);
    expect(sds.get(2)!).toBeLessThan(48); // raw spread ~48, pulled toward 25
  });
});

describe("live week in the simulation", () => {
  it("treats a fully played week as final (no spread)", () => {
    const team = (rosterId: number, mean: number) => ({ rosterId, division: null, wins: 5, losses: 5, ties: 0, pointsFor: 1000, weekMeans: new Map([[12, mean], [15, 100]]), weekSd: new Map([[12, 0]]) });
    const input: SimInput = { teams: [team(1, 120), team(2, 100)], schedule: [{ week: 12, pairs: [[1, 2]] }], playoffWeeks: [15], playoffTeams: 1, medianGame: false, divisionWinnersSeedFirst: false, weeksPerRound: 1, sd: 25 };
    const odds = simulateSeason(input, 500);
    expect(odds.find((o) => o.rosterId === 1)!.avgWins).toBe(6);
    expect(odds.find((o) => o.rosterId === 1)!.playoffPct).toBe(1);
  });
});

describe("upcoming week", () => {
  it("moves on once Sleeper has scored the current week", async () => {
    const { upcomingWeek } = await import("@/lib/league/week");
    expect(upcomingWeek({ currentWeek: 11, lastScoredWeek: 10, status: "in_season" })).toBe(11); // games in progress
    expect(upcomingWeek({ currentWeek: 11, lastScoredWeek: 11, status: "in_season" })).toBe(12); // scored, counter not yet moved
    expect(upcomingWeek({ currentWeek: 1, lastScoredWeek: 0, status: "pre_draft" })).toBe(1);
    expect(upcomingWeek({ currentWeek: null, lastScoredWeek: 4, status: "in_season" })).toBe(5);
  });
});
