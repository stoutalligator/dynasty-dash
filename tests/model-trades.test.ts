import { describe, expect, it } from "vitest";
import { buildLeagueModel, valuePick } from "@/lib/analysis/model";
import { packageValue, teamAssets } from "@/lib/trades/assets";
import { evaluateTrade, strategyMultiplier } from "@/lib/trades/evaluate";
import { generateTrades } from "@/lib/trades/generate";
import { buildSnapshot, external, model, team } from "./league-fixture";


describe("buildLeagueModel", () => {
  it("builds best lineups from actual production", () => {
    // Team 3: QB 21 + RB 18 + WR 19 + TE 10 + FLEX (RB 14 / WR 14) + SF QB 19
    expect(team(3).lineup.total).toBe(101);
    expect(team(3).powerRank).toBe(1);
  });

  it("classifies the strongest team as a contender and the weakest as rebuilding", () => {
    expect(team(3).strategy.inferred).toBe("contender");
    expect(team(4).strategy.inferred).toBe("rebuild");
    expect(team(3).strategy.reasons.length).toBeGreaterThan(3);
  });

  it("flags age risk and identifies needs", () => {
    expect(team(2).players.find((p) => p.id === "b-qb1")?.ageRisk).toBe(true);
    expect(team(1).needs.map((n) => n.position)).toContain("TE");
  });

  it("respects manual strategy overrides", () => {
    const m = buildLeagueModel({
      snapshot: buildSnapshot(), external,
      providerStatus: { configured: "test", active: "test", fetchedAt: null, stale: false, error: null },
      prefs: { strategyOverrides: { "4": "contender" }, untouchables: [], tradeBlock: [], targets: [], savedProposals: [] },
    });
    const t4 = m.teams.find((t) => t.team.rosterId === 4)!;
    expect(t4.strategy).toMatchObject({ inferred: "rebuild", override: "contender", effective: "contender" });
  });

  it("values picks by estimated slot for the nearest season", () => {
    // Weakest team's own 1st projects early.
    expect(team(4).picks.find((p) => p.round === 1)?.value).toBe(4500);
    expect(team(3).picks.find((p) => p.round === 1)?.value).toBe(2200);
  });

  it("falls back to an internal estimate when no provider is available", () => {
    const m = buildLeagueModel({
      snapshot: buildSnapshot(), external: null,
      providerStatus: { configured: "none", active: null, fetchedAt: null, stale: false, error: null },
      prefs: { strategyOverrides: {}, untouchables: [], tradeBlock: [], targets: [], savedProposals: [] },
    });
    expect(m.valuation.kind).toBe("internal-estimate");
    expect(m.freeAgents).toEqual([]);
    expect(m.teams.every((t) => t.players.every((p) => p.valueSource === "internal-estimate"))).toBe(true);
  });
});

describe("valuePick", () => {
  it("extrapolates seasons the provider does not cover", () => {
    expect(valuePick("2029", 1, external, null, 4)).toMatchObject({ value: Math.round(3000 * 0.81) });
  });
});

describe("trade evaluation", () => {
  const asset = (rid: number, id: string) => teamAssets(team(rid)).find((a) => a.assetId === `player:${id}`)!;

  it("applies a depth discount to packages", () => {
    expect(packageValue([4000, 4000])).toBe(7400);
    expect(packageValue([1000])).toBe(1000);
  });

  it("measures lineup impact for both sides", () => {
    const ev = evaluateTrade(model, { myRosterId: 1, partnerRosterId: 2, myGives: [asset(1, "a-rb2")], theirGives: [asset(2, "b-te1")], objective: "contender" });
    expect(ev.mine.lineupDelta).toBeGreaterThan(0);
    expect(ev.mine.needsAddressed).toContain("TE");
    expect(ev.partner.lineupDelta).toBeLessThan(0);
    expect(ev.risks.some((r) => r.includes("decline age"))).toBe(true);
  });

  it("weights assets by strategy", () => {
    const vet = asset(2, "b-qb1");
    const young = asset(1, "a-qb2");
    expect(strategyMultiplier("rebuild", vet)).toBeLessThan(strategyMultiplier("rebuild", young));
    expect(strategyMultiplier("contender", teamAssets(team(1)).find((a) => a.kind === "pick")!)).toBeLessThan(1);
  });

  it("generates proposals that respect untouchables and filters", () => {
    const out = generateTrades(model, 1, { objective: "contender", untouchables: ["player:a-wr1"], positions: ["TE", "QB"], limit: 10 });
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) {
      expect(e.mine.gives.map((a) => a.assetId)).not.toContain("player:a-wr1");
      expect(e.mine.gets.some((a) => a.position === "TE" || a.position === "QB")).toBe(true);
      expect(e.mine.score).toBeGreaterThan(0);
    }
  });
});
