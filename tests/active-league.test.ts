import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveLeague } from "@/lib/league/active";
import { toLeagueOption } from "@/lib/league/discover";
import { verify } from "@/lib/league/load-snapshot";
import type { SleeperLeague } from "@/lib/sleeper/schemas";

const users = [
  { user_id: "u1", display_name: "fiesterfamine", metadata: { team_name: "Fiester Famine" } },
  { user_id: "u2", display_name: "rival", metadata: {} },
];
const rosters = [
  { roster_id: 1, owner_id: "u1", co_owners: null },
  { roster_id: 2, owner_id: "u2", co_owners: ["u9"] },
];
const active = (over: Partial<ActiveLeague>): ActiveLeague => ({
  leagueId: "L", source: "app", userId: null, username: null, rosterId: null, expectedTeamName: null, recent: [], ...over,
});

describe("identifying my team", () => {
  it("uses the Sleeper account, including co-owners", () => {
    expect(verify(active({ userId: "u1", username: "fiesterfamine" }), "League", users, rosters).myRosterId).toBe(1);
    expect(verify(active({ userId: "u9", username: "coowner" }), "League", users, rosters).myRosterId).toBe(2);
  });

  it("treats a non-member account as a spectator", () => {
    const r = verify(active({ userId: "zzz", username: "visitor" }), "League", users, rosters);
    expect(r.myRosterId).toBeNull();
    expect(r.verification.notes[0]).toMatch(/doesn't manage a team/);
  });

  it("falls back to an explicit roster, then to a team name", () => {
    expect(verify(active({ source: "env", rosterId: 2 }), "League", users, rosters).myRosterId).toBe(2);
    expect(verify(active({ source: "env", expectedTeamName: "fiester famine" }), "League", users, rosters).myRosterId).toBe(1);
    const missing = verify(active({ source: "env", rosterId: 7 }), "League", users, rosters);
    expect(missing.myRosterId).toBeNull();
    expect(missing.verification.notes[0]).toMatch(/does not exist/);
  });
});

describe("active league resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefers the in-app selection over environment defaults", async () => {
    vi.stubEnv("STORAGE", "file");
    vi.stubEnv("DATA_DIR", mkdtempSync(path.join(os.tmpdir(), "dd-active-")));
    vi.stubEnv("SLEEPER_LEAGUE_ID", "111");
    vi.stubEnv("MY_ROSTER_ID", "3");
    const mod = await import("@/lib/league/active");
    expect(await mod.resolveActiveLeague()).toMatchObject({ leagueId: "111", source: "env", rosterId: 3 });
    await mod.writeSelection({ leagueId: "222", userId: "u1", username: "me", rosterId: null, recent: [], selectedAt: new Date().toISOString() });
    expect(await mod.resolveActiveLeague()).toMatchObject({ leagueId: "222", source: "app", userId: "u1" });
  });

  it("returns null when nothing is configured", async () => {
    vi.stubEnv("STORAGE", "file");
    vi.stubEnv("DATA_DIR", mkdtempSync(path.join(os.tmpdir(), "dd-active-")));
    vi.stubEnv("SLEEPER_LEAGUE_ID", "");
    const mod = await import("@/lib/league/active");
    expect(await mod.resolveActiveLeague()).toBeNull();
  });
});

describe("league options", () => {
  it("labels type and format for the picker", () => {
    const o = toLeagueOption({
      league_id: "9", name: "Test", season: "2026", status: "in_season", total_rosters: 10, avatar: null,
      roster_positions: ["QB", "RB", "SUPER_FLEX"], scoring_settings: { rec: 1 }, settings: { num_teams: 10, type: 2 },
    } as unknown as SleeperLeague);
    expect(o).toMatchObject({ type: "Dynasty", format: "PPR · Superflex", status: "in season", teams: 10 });
  });
});
