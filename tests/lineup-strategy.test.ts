import { describe, expect, it } from "vitest";
import { gradeFromRank, rankDesc } from "@/lib/analysis/grades";
import { lineupImpacts, optimalLineup } from "@/lib/analysis/lineup";
import { computeProduction } from "@/lib/analysis/production";
import { classify } from "@/lib/analysis/strategy";

const c = (id: string, pos: string, score: number) => ({ id, positions: [pos], score });

describe("optimalLineup", () => {
  const slots = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"];

  it("fills restrictive slots first and uses a second QB at superflex", () => {
    const lu = optimalLineup([c("q1", "QB", 20), c("q2", "QB", 15), c("r1", "RB", 14), c("r2", "RB", 10), c("w1", "WR", 12), c("t1", "TE", 5)], slots);
    expect(lu.assignments.map((a) => a.playerId)).toEqual(["q1", "r1", "w1", "t1", "r2", "q2"]);
    expect(lu.total).toBe(76);
  });

  it("leaves slots empty when nobody is eligible", () => {
    const lu = optimalLineup([c("q1", "QB", 20)], ["QB", "TE"]);
    expect(lu.assignments[1]).toEqual({ slot: "TE", playerId: null, score: 0 });
  });

  it("measures lineup impact as points lost when a player is removed", () => {
    const imp = lineupImpacts([c("q1", "QB", 20), c("q2", "QB", 12), c("r1", "RB", 9)], ["QB", "RB"]);
    expect(imp.get("q1")).toBe(8);
    expect(imp.get("q2")).toBe(0);
    expect(imp.get("r1")).toBe(9);
  });
});

describe("computeProduction", () => {
  it("ignores in-progress weeks, counts non-zero weeks, and tracks bench points", () => {
    const entry = (pts: Record<string, number>, starters: string[]) => ({ rosterId: 1, matchupId: 1, points: 0, starters, startersPoints: [], playersPoints: pts });
    const prod = computeProduction([
      { week: 1, complete: true, entries: [entry({ a: 10, b: 4 }, ["a"])] },
      { week: 2, complete: true, entries: [entry({ a: 0, b: 6 }, ["b"])] },
      { week: 3, complete: false, entries: [entry({ a: 50 }, ["a"])] },
    ]);
    expect(prod.get("a")).toMatchObject({ activeWeeks: 1, total: 10, ppg: 10, adjPpg: 5, weeksStarted: 1, weeksBenched: 1 });
    expect(prod.get("b")).toMatchObject({ benchPoints: 4, weeksBenched: 1, ppg: 5 });
  });
});

describe("strategy classification", () => {
  const base = { youthPct: 0.5, youngValuePct: 0.5, capitalPct: 0.5, totalValuePct: 0.5, scoredWeeks: 6, valuationIsEstimate: false };

  it("does not classify by record alone", () => {
    const lucky = classify({ ...base, lineupPct: 0.1, pointsForPct: 0.2, potentialPct: 0.1, winPct: 1 });
    expect(lucky.strategy).not.toBe("contender");
    const unlucky = classify({ ...base, lineupPct: 1, pointsForPct: 0.9, potentialPct: 1, winPct: 0.3 });
    expect(unlucky.strategy).toBe("contender");
  });

  it("lowers confidence early in the season", () => {
    const i = { ...base, lineupPct: 1, pointsForPct: 1, potentialPct: 1, winPct: 1 };
    expect(classify(i).confidence).toBe("high");
    expect(classify({ ...i, scoredWeeks: 2 }).confidence).toBe("medium");
  });
});

describe("grades", () => {
  it("ranks with ties and maps to letters", () => {
    expect(rankDesc([5, 9, 5, 1])).toEqual([2, 1, 2, 4]);
    expect(gradeFromRank(1, 12).grade).toBe("A+");
    expect(gradeFromRank(12, 12).grade).toBe("F");
  });
});
