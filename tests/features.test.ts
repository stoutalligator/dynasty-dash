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
