import { describe, expect, it, vi } from "vitest";
import { backtestSeasons, spearman } from "@/lib/analysis/backtest";
import { gradedPositions } from "@/lib/analysis/lineup";
import type { HistoricalSeason } from "@/lib/history/load";
import { buildSeasonSim, oddsDelta, pooledWeeklySd } from "@/lib/sim/context";
import { seedTeams, simulateSeason, type SimInput } from "@/lib/sim/season";
import type { StatLine } from "@/lib/stats/scoring";
import { buildDigest, digestText } from "@/lib/digest/build";
import type { SleeperLeague } from "@/lib/sleeper/schemas";
import { model, TEAMS } from "./league-fixture";

const means = (m: number) => new Map([[10, m], [11, m], [15, m], [16, m], [17, m]]);
const team = (rosterId: number, mean: number, wins = 5, division: number | null = null) => ({ rosterId, division, wins, losses: 5, ties: 0, pointsFor: 1000, weekMeans: means(mean) });

const input = (teams: SimInput["teams"]): SimInput => ({
  teams,
  schedule: [
    { week: 10, pairs: [[1, 2], [3, 4], [5, 6]] },
    { week: 11, pairs: [[1, 3], [2, 5], [4, 6]] },
  ],
  playoffWeeks: [15, 16, 17],
  playoffTeams: 4,
  medianGame: true,
  divisionWinnersSeedFirst: false,
  weeksPerRound: 1,
  sd: 20,
});

describe("season simulation", () => {
  const teams = [team(1, 160), team(2, 120), team(3, 118), team(4, 115), team(5, 110), team(6, 100)];
  const odds = simulateSeason(input(teams), 4000);

  it("produces coherent probabilities", () => {
    const sum = (k: "playoffPct" | "titlePct" | "finalPct") => odds.reduce((a, o) => a + o[k], 0);
    expect(sum("playoffPct")).toBeCloseTo(4, 5);
    expect(sum("titlePct")).toBeCloseTo(1, 5);
    expect(sum("finalPct")).toBeCloseTo(2, 5);
  });

  it("favors the strongest team and is deterministic for a seed", () => {
    const best = odds.find((o) => o.rosterId === 1)!;
    expect(best.titlePct).toBeGreaterThan(0.4);
    expect(best.playoffPct).toBeGreaterThan(odds.find((o) => o.rosterId === 6)!.playoffPct);
    expect(simulateSeason(input(teams), 500)).toEqual(simulateSeason(input(teams), 500));
  });

  it("seeds division winners first when configured", () => {
    const s = seedTeams(
      [
        { idx: 0, wins: 10, pf: 1, division: 1 },
        { idx: 1, wins: 9, pf: 1, division: 1 },
        { idx: 2, wins: 4, pf: 1, division: 2 },
      ],
      2,
      true,
    );
    expect(s).toEqual([0, 2]);
  });

  it("measures week-to-week spread from history", () => {
    const wk = (week: number, pts: number[]) => ({ week, complete: true, entries: pts.map((p, i) => ({ rosterId: i + 1, matchupId: null, points: p, starters: [], startersPoints: [], playersPoints: {} })) });
    const sd = pooledWeeklySd([[wk(1, [100, 120]), wk(2, [120, 100]), wk(3, [110, 110]), wk(4, [100, 120]), wk(5, [120, 100]), wk(6, [110, 110]), wk(7, [100, 120])]]);
    expect(sd).toBeGreaterThan(5);
    expect(sd).toBeLessThan(12);
  });
});

describe("trade odds", () => {
  // Projections for the fixture league: every player projects at their production level.
  const line = (pts: number): StatLine => ({ pts, gp: 1, offSnp: null, tmOffSnp: null, tgt: 0, rec: 0, rushAtt: 0, passAtt: 0, recYd: 0, rushYd: 0, passYd: 0 });
  const projections = new Map([4, 5, 6, 7].map((w) => [w, new Map(Object.values(TEAMS).flat().map((s) => [s.id, line(s.ppg)]))]));
  const summary = buildSeasonSim({
    model: { ...model, league: { ...model.league, playoffWeekStart: 6, playoffTeams: 2, currentWeek: 4 } },
    projections,
    completedWeeks: [],
    historicalWeeks: [],
    schedule: [{ week: 4, pairs: [[1, 2], [3, 4]] }, { week: 5, pairs: [[1, 3], [2, 4]] }],
    runs: 2000,
  });

  it("simulates the fixture league", () => {
    expect(summary).not.toBeNull();
    expect(summary!.teams.reduce((a, t) => a + t.titlePct, 0)).toBeCloseTo(1, 5);
    expect(summary!.assumptions.length).toBeGreaterThan(3);
  });

  it("raises odds when a team adds an elite starter", () => {
    const m = { ...model, league: { ...model.league, playoffWeekStart: 6, playoffTeams: 2, currentWeek: 4 } };
    buildSeasonSim({ model: m, projections, completedWeeks: [], historicalWeeks: [], schedule: [{ week: 4, pairs: [[1, 2], [3, 4]] }, { week: 5, pairs: [[1, 3], [2, 4]] }], runs: 1000 });
    const d = oddsDelta(m, [
      { rosterId: 4, out: ["d-qb2"], in: ["c-qb1"] },
      { rosterId: 3, out: ["c-qb1"], in: ["d-qb2"] },
    ])!;
    expect(d.get(4)!.playoffAfter).toBeGreaterThanOrEqual(d.get(4)!.playoffBefore);
    expect(d.get(3)!.titleAfter).toBeLessThanOrEqual(d.get(3)!.titleBefore);
  });
});

describe("model check", () => {
  it("computes Spearman correlation", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
  });

  it("scores early-season signals against final standings", () => {
    const weeks = Array.from({ length: 10 }, (_, i) => ({
      week: i + 1,
      complete: true,
      entries: [1, 2, 3, 4].map((r) => ({ rosterId: r, matchupId: r <= 2 ? 1 : 2, points: 100 + r * 10, starters: [], startersPoints: [], playersPoints: { [`p${r}`]: 100 + r * 10 } })),
    }));
    const season = {
      season: "2025", status: "complete", leagueId: "x", users: [], transactions: [], drafts: [], placements: {}, rosterOwner: {}, weeks,
      league: { roster_positions: ["QB"], settings: { league_average_match: 1, playoff_teams: 2 } } as unknown as SleeperLeague,
      rosters: [1, 2, 3, 4].map((r) => ({ roster_id: r, owner_id: null, settings: { wins: r * 3, losses: 12 - r * 3, ties: 0, fpts: 1000 + r } })),
    } as HistoricalSeason;
    const players = Object.fromEntries([1, 2, 3, 4].map((r) => [`p${r}`, { fantasyPositions: ["QB"] }])) as never;
    const r = backtestSeasons([season], players, 4);
    expect(r.seasons[0].rho.pointsFor).toBe(1);
    expect(r.seasons[0].playoffHits.composite).toBe(2);
  });
});

describe("graded positions", () => {
  it("adds K and DEF only when the league starts them", () => {
    expect(gradedPositions(["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"])).toEqual(["QB", "RB", "WR", "TE"]);
    expect(gradedPositions(["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"])).toEqual(["QB", "RB", "WR", "TE", "K", "DEF"]);
  });
});

describe("digest", () => {
  it("summarizes and flags changes since the previous digest", () => {
    const d1 = buildDigest(model, [], null);
    expect(d1.sections.map((s) => s.key)).toEqual(["waivers", "injuries", "trades", "league"]);
    const flipped = { ...d1.memory, strategies: { ...d1.memory.strategies, "4": "contender" as const } };
    const d2 = buildDigest(model, [], flipped);
    const league = d2.sections.find((s) => s.key === "league")!;
    expect(league.items.some((i) => i.tag === "new" && i.title.includes("contender →"))).toBe(true);
    const text = digestText(d2, "https://dash.example.com");
    expect(text).toContain("Around the league");
    expect(text.endsWith("https://dash.example.com/digest")).toBe(true);
  });

  it("delivers to Discord and ntfy", async () => {
    vi.stubEnv("SLEEPER_LEAGUE_ID", "123");
    vi.stubEnv("DIGEST_WEBHOOK_URL", "https://discord.com/api/webhooks/1/abc");
    vi.stubEnv("NTFY_TOPIC", "dynasty-test-topic");
    vi.stubEnv("STORAGE", "file");
    const { deliverDigest } = await import("@/lib/digest/run");
    const fetchImpl = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const res = await deliverDigest(buildDigest(model, [], null), fetchImpl);
    expect(res.map((r) => `${r.channel}:${r.ok}`)).toEqual(["discord:true", "ntfy:true"]);
    const discordBody = JSON.parse(String((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body));
    expect(discordBody.content.length).toBeLessThanOrEqual(2000);
    vi.unstubAllEnvs();
  });
});
