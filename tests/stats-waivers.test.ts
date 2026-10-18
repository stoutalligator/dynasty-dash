import { describe, expect, it } from "vitest";
import { buildLeagueModel } from "@/lib/analysis/model";
import { computeProductionFromStats } from "@/lib/analysis/production";
import { buildWaiverBoard, pickupComponents } from "@/lib/analysis/waivers";
import { normalizePlayer } from "@/lib/players/normalize";
import type { StatsBundle } from "@/lib/stats/load";
import { scoreStatLine, toStatLine, type StatLine } from "@/lib/stats/scoring";
import { asOf, buildSnapshot, external, TEAMS } from "./league-fixture";

const HALF_PPR = { rec: 0.5, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_yd: 0.04, pass_td: 4, pass_int: -1, fum_lost: -2 };

describe("league scoring", () => {
  it("applies scoring settings to raw stats and ignores non-scoring keys", () => {
    expect(scoreStatLine({ rec: 6, rec_yd: 80, rec_td: 1, off_snp: 50, pts_ppr: 99 }, HALF_PPR)).toBe(17);
    expect(scoreStatLine({ pass_yd: 250, pass_td: 2, pass_int: 1 }, HALF_PPR)).toBe(17);
    expect(scoreStatLine({ rec: "bad" as unknown as number }, HALF_PPR)).toBe(0);
  });

  it("builds slim lines with snaps and opportunity", () => {
    const l = toStatLine({ gp: 1, off_snp: 40, tm_off_snp: 64, rec_tgt: 7, rush_att: 3, rec: 5 }, HALF_PPR);
    expect(l).toMatchObject({ gp: 1, offSnp: 40, tmOffSnp: 64, tgt: 7, rushAtt: 3, pts: 2.5 });
  });
});

const line = (pts: number, extra: Partial<StatLine> = {}): StatLine => ({
  pts, gp: 1, offSnp: 30, tmOffSnp: 60, tgt: 4, rec: 3, rushAtt: 0, passAtt: 0, recYd: 30, rushYd: 0, passYd: 0, ...extra,
});

describe("computeProductionFromStats", () => {
  it("counts games from NFL stats, tracks snap trend, and merges fantasy usage", () => {
    const stats = new Map([
      [1, new Map([["x", line(10, { offSnp: 18 })]])],
      [2, new Map([["x", line(0, { gp: 1, offSnp: 24 })]])], // played, scored 0
      [3, new Map<string, StatLine>()], // bye
      [4, new Map([["x", line(14, { offSnp: 48 })]])],
      [5, new Map([["x", line(16, { offSnp: 54 })]])],
    ]);
    const weeks = [{ week: 4, complete: true, entries: [{ rosterId: 2, matchupId: 1, points: 0, starters: [], startersPoints: [], playersPoints: { x: 14 } }] }];
    const p = computeProductionFromStats(stats, weeks, () => "WR").get("x")!;
    expect(p.activeWeeks).toBe(4);
    expect(p.total).toBe(40);
    expect(p.ppg).toBe(10);
    expect(p.last3Ppg).toBe(10); // last three games: 0, 14, 16
    expect(p.snapShareLast3).toBeCloseTo((0.4 + 0.8 + 0.9) / 3, 2);
    expect(p.snapTrend).toBeGreaterThan(0.4);
    expect(p).toMatchObject({ weeksBenched: 1, benchPoints: 14, source: "stats" });
  });
});

describe("waiver board", () => {
  // Add one productive free agent TE and one idle free agent to the synthetic league.
  const snap = buildSnapshot();
  snap.players["fa-te"] = normalizePlayer({ player_id: "fa-te", full_name: "Free Te", position: "TE", fantasy_positions: ["TE"], team: "PIT", birth_date: "2002-01-01" }, asOf);
  snap.players["fa-wr"] = normalizePlayer({ player_id: "fa-wr", full_name: "Idle Wr", position: "WR", fantasy_positions: ["WR"], team: "NYJ", birth_date: "1995-01-01" }, asOf);
  const statsByWeek = new Map<number, Map<string, StatLine>>();
  for (const w of [1, 2, 3]) {
    const m = new Map<string, StatLine>();
    for (const s of Object.values(TEAMS).flat()) m.set(s.id, line(s.ppg));
    m.set("fa-te", line(9, { offSnp: 50, tmOffSnp: 60, tgt: 6 }));
    m.set("fa-wr", line(0.5, { offSnp: 6, tmOffSnp: 60, tgt: 1 }));
    statsByWeek.set(w, m);
  }
  const stats: StatsBundle = {
    stats: statsByWeek,
    projections: new Map([[4, new Map([["fa-te", line(8)], ["fa-wr", line(1)]])]]),
    freshness: {},
    issues: [],
  };
  const model = buildLeagueModel({
    snapshot: snap, external, stats,
    providerStatus: { configured: "test", active: "test", fetchedAt: null, stale: false, error: null },
    prefs: { strategyOverrides: {}, untouchables: [], tradeBlock: [], targets: [], savedProposals: [] },
    trending: { adds: new Map([["fa-te", 25000]]), drops: new Map(), fetchedAt: asOf.toISOString() },
  });
  const me = model.teams.find((t) => t.team.rosterId === 1)!;
  const board = buildWaiverBoard(model, me, 100);

  it("maps unrostered players with real production into the free-agent pool", () => {
    expect(model.statsSource).toBe("stats");
    const fa = model.freeAgents.find((p) => p.id === "fa-te")!;
    expect(fa).toMatchObject({ rosterId: null, projWeek: 8, trendingAdds: 25000 });
    expect(fa.prod?.ppg).toBe(9);
  });

  it("ranks the productive TE above the idle WR and explains why", () => {
    const te = board.candidates.find((c) => c.player.id === "fa-te")!;
    const wr = board.candidates.find((c) => c.player.id === "fa-wr")!;
    expect(te.score).toBeGreaterThan(wr.score);
    expect(te.lineupGain).toBeGreaterThan(0); // team 1's TE produces 3 PPG
    expect(te.fillsNeed).toBe(true);
    expect(te.reasons.some((r) => r.startsWith("Would start for you"))).toBe(true);
    expect(wr.tier).toBe("Monitor");
  });

  it("anchors production to replacement level, not to other free agents", () => {
    const c = pickupComponents(model.freeAgents.find((p) => p.id === "fa-wr")!, 10);
    expect(c.production).toBeLessThan(0.1);
    // The fixture team has no FAAB-used figure, so remaining budget is unknown rather than guessed.
    expect(board.faab).toBeNull();
  });
});
