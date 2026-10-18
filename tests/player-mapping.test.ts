import { describe, expect, it } from "vitest";
import { classifyRoster, mapTeams } from "@/lib/players/map-players";
import { ageFromBirthDate, lookupPlayer, normalizePlayer } from "@/lib/players/normalize";
import { db, roster, users } from "./fixtures";

const slots = ["QB", "RB", "WR", "TE", "SUPER_FLEX"];

describe("player normalization", () => {
  it("computes fractional age from birth date", () => {
    expect(ageFromBirthDate("2000-10-18", new Date("2026-10-18T00:00:00Z"))).toBe(26);
    expect(ageFromBirthDate("not-a-date")).toBeNull();
  });

  it("falls back to name parts and keeps injury details", () => {
    const p = normalizePlayer({ player_id: "9", first_name: "A", last_name: "B", position: "RB", injury_status: "Questionable", injury_body_part: "Knee" });
    expect(p.name).toBe("A B");
    expect(p.injury).toEqual({ status: "Questionable", bodyPart: "Knee", notes: null, practice: null });
  });

  it("names team defenses", () => {
    expect(normalizePlayer({ player_id: "DET", position: "DEF", team: "DET" }).name).toBe("DET D/ST");
  });

  it("preserves unknown ids instead of dropping them", () => {
    const p = lookupPlayer(db, "missing9");
    expect(p.mapped).toBe(false);
    expect(p.name).toContain("missing9");
  });
});

describe("classifyRoster", () => {
  it("labels starters with lineup slots, and taxi/reserve take precedence", () => {
    const out = classifyRoster(roster(), slots, db);
    const byId = Object.fromEntries(out.map((r) => [r.player.id, r]));
    expect(byId.q1).toMatchObject({ slot: "starter", starterSlot: "QB" });
    expect(byId.q2).toMatchObject({ slot: "starter", starterSlot: "SUPER_FLEX" });
    expect(byId.w4.slot).toBe("taxi");
    expect(byId.r2.slot).toBe("reserve");
    expect(byId.w2.slot).toBe("bench");
    expect(out).toHaveLength(11);
  });

  it("ignores empty starter slots and keeps players listed only in starters", () => {
    const out = classifyRoster(roster({ players: ["q1"], starters: ["q1", "0", "w1"], taxi: [], reserve: [] }), slots, db);
    expect(out.map((r) => r.player.id).sort()).toEqual(["q1", "w1"]);
    expect(out.find((r) => r.player.id === "w1")?.starterSlot).toBe("WR");
  });
});

describe("mapTeams", () => {
  it("joins managers, computes points, and reports unmapped players", () => {
    const { teams, issues } = mapTeams({ rosters: [roster()], users, players: db, startingSlots: slots, divisionNames: { 1: "North" }, myRosterId: 1 });
    expect(teams[0]).toMatchObject({ teamName: "Fiester Famine", pointsFor: 582.86, potentialPoints: 680.38, divisionName: "North", isMine: true, streak: "3W" });
    expect(teams[0].manager?.avatarUrl).toBe("https://sleepercdn.com/avatars/thumbs/abc");
    expect(issues.map((i) => i.code)).toEqual(["player-unmapped"]);
  });

  it("falls back to display name and flags orphaned rosters", () => {
    const { teams, issues } = mapTeams({
      rosters: [roster({ roster_id: 2, owner_id: "u2", players: [] }), roster({ roster_id: 3, owner_id: null, players: [] })],
      users,
      players: db,
      startingSlots: slots,
      divisionNames: {},
      myRosterId: 1,
    });
    expect(teams[0].teamName).toBe("rival");
    expect(teams[1].teamName).toBe("Team 3");
    expect(issues.some((i) => i.code === "roster-unowned")).toBe(true);
  });
});
