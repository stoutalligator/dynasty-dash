import { describe, expect, it } from "vitest";
import { analyzeHistory } from "@/lib/history/analyze";
import { placementsFromBracket, type HistoricalSeason } from "@/lib/history/load";
import type { Transaction } from "@/lib/league/models";
import type { SleeperLeague } from "@/lib/sleeper/schemas";
import { teamAssets } from "@/lib/trades/assets";
import { evaluateSide } from "@/lib/trades/evaluate";
import { generateThreeTeamTrades } from "@/lib/trades/three-team";
import { model, team } from "./league-fixture";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), type: "trade", status: "complete", createdAt: 1, week: 1, rosterIds: [], adds: [], drops: [], picks: [], faab: [], waiverBid: null, ...over,
});

describe("placementsFromBracket", () => {
  it("maps placement games to finishes", () => {
    expect(placementsFromBracket([{ p: 1, w: 7, l: 3 }, { p: 3, w: 2, l: 9 }, { w: 1, l: 4 }])).toEqual({ 7: 1, 3: 2, 2: 3, 9: 4 });
  });
});

describe("analyzeHistory", () => {
  // Last season: roster 2 belonged to a manager who has since left; roster 1 was "u1".
  const past: HistoricalSeason = {
    leagueId: "L25",
    season: "2025",
    status: "complete",
    league: { previous_league_id: null } as unknown as SleeperLeague,
    users: [
      { user_id: "u1", display_name: "one", metadata: { team_name: "Team One" } },
      { user_id: "gone", display_name: "former" },
    ],
    rosters: [
      { roster_id: 1, owner_id: "u1", settings: { wins: 9, losses: 5, ties: 0, fpts: 1500 } },
      { roster_id: 2, owner_id: "gone", settings: { wins: 5, losses: 9, ties: 0, fpts: 1300 } },
    ],
    rosterOwner: { 1: "u1", 2: "gone" },
    placements: { 1: 1, 2: 2 },
    transactions: [
      tx({ rosterIds: [1, 2], adds: [{ playerId: "p-old", rosterId: 1 }], picks: [{ season: "2026", round: 1, originalRosterId: 1, fromRosterId: 1, toRosterId: 2 }] }),
      tx({ type: "waiver", rosterIds: [1], adds: [{ playerId: "p-wire", rosterId: 1 }], waiverBid: 12 }),
    ],
    drafts: [],
  };
  // The 2026 rookie draft: u1's slot 3 pick in round 1 was "rookie".
  const current: HistoricalSeason = {
    ...past,
    leagueId: "L26",
    season: "2026",
    status: "in_season",
    placements: {},
    transactions: [],
    drafts: [{ draftId: "d26", season: "2026", status: "complete", draftOrder: { u1: 3 }, slotToRoster: {}, picks: [{ round: 1, pick_no: 3, draft_slot: 3, player_id: "rookie" }] }],
  };
  const values: Record<string, number> = { "p-old": 1000, rookie: 4000, "p-now": 500 };
  const a = analyzeHistory(
    { seasons: [current, past], issues: [] },
    {
      currentSeason: "2026",
      currentLeagueId: "L26",
      currentTransactions: [tx({ rosterIds: [1, 3], adds: [{ playerId: "p-now", rosterId: 3 }] })],
      teams: [{ rosterId: 1, ownerId: "u1", name: "Team One Now" }, { rosterId: 3, ownerId: "u3", name: "Team Three" }],
      player: (id) => ({ name: id, position: "WR", value: values[id] ?? null }),
      futurePick: () => null,
    },
  );

  it("resolves traded picks to the drafted player and values trades with hindsight", () => {
    const t = a.trades.find((x) => x.season === "2025")!;
    const formerSide = t.sides.find((s) => s.ownerId === "gone")!;
    expect(formerSide.received[0].label).toBe("2026 1st → rookie");
    expect(formerSide.valueNow).toBe(4000);
    expect(formerSide.name).toBe("former"); // departed managers keep their past name
    expect(t.leader).toBe("gone");
  });

  it("builds manager profiles keyed to current teams", () => {
    const u1 = a.managers.find((m) => m.ownerId === "u1")!;
    expect(u1).toMatchObject({ rosterId: 1, name: "Team One Now", trades: 2, picksOut: 1, playersIn: 1, waiverAdds: 1, faabSpent: 12, hindsightNet: -3500 }); // -3000 (2025) and -500 (2026)
    expect(u1.tradesBySeason).toEqual({ "2025": 1, "2026": 1 });
    expect(a.seasons[0].champion?.name).toBe("Team One Now");
    expect(a.activityByRoster[1]).toBeGreaterThan(a.activityByRoster[3]);
  });
});

describe("three-team trades", () => {
  it("returns valid one-for-one cycles that respect untouchables", () => {
    const untouchable = teamAssets(team(1))[0].assetId;
    const out = generateThreeTeamTrades(model, 1, { objective: "contender", untouchables: [untouchable] });
    for (const e of out) {
      const [a, b, c] = e.legs;
      expect(a.from).toBe(1);
      expect(b.from).toBe(a.to);
      expect(c.from).toBe(b.to);
      expect(c.to).toBe(1);
      expect(new Set([a.to, b.to]).size).toBe(2);
      expect(a.asset.assetId).not.toBe(untouchable);
      expect(e.sides[0].score).toBeGreaterThan(0.5);
    }
  });
});

describe("roster-spot cost", () => {
  it("charges the value of players who must be cut", () => {
    const tight = { ...model, league: { ...model.league, benchSlots: 0 } }; // 6 active spots, 7 players
    const t2 = team(2);
    const give = teamAssets(t2).filter((a) => a.kind === "player").slice(0, 1);
    const get = teamAssets(team(4)).filter((a) => a.kind === "player").slice(0, 2);
    const side = evaluateSide(tight, t2, give, get, "contender");
    expect(side.rosterOverflow).toBe(2);
    expect(side.cuts).toHaveLength(2);
    expect(side.reasonsAgainst.some((r) => r.startsWith("Must release"))).toBe(true);
  });
});
