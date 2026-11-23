import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("next/headers");
  });

  const withCookie = (value: string | undefined) =>
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "dd_league" && value ? { value } : undefined) }) }));

  it("uses the visitor's cookie in a request, and never the env default", async () => {
    vi.stubEnv("SLEEPER_LEAGUE_ID", "111");
    withCookie(undefined);
    let mod = await import("@/lib/league/active");
    expect(await mod.resolveActiveLeague()).toBeNull(); // no choice yet → /setup
    vi.resetModules();
    const sel = { leagueId: "222", userId: "u1", username: "me", rosterId: null, recent: [], selectedAt: new Date().toISOString() };
    withCookie(Buffer.from(JSON.stringify(sel)).toString("base64url"));
    mod = await import("@/lib/league/active");
    expect(await mod.resolveActiveLeague()).toMatchObject({ leagueId: "222", source: "app", userId: "u1" });
  });

  it("ignores a tampered or malformed cookie", async () => {
    withCookie("not-base64-json");
    const mod = await import("@/lib/league/active");
    expect(await mod.resolveActiveLeague()).toBeNull();
    expect(mod.decodeSelection(Buffer.from(JSON.stringify({ leagueId: "abc" })).toString("base64url"))).toBeNull();
  });

  it("gives scheduled jobs the env league", async () => {
    vi.stubEnv("SLEEPER_LEAGUE_ID", "111");
    vi.stubEnv("MY_ROSTER_ID", "3");
    const mod = await import("@/lib/league/active");
    expect(mod.defaultLeague()).toMatchObject({ leagueId: "111", source: "env", rosterId: 3 });
  });
});

describe("per-team preferences", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps each team's settings separate and carries the owner's old ones over", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "dd-prefs-"));
    vi.stubEnv("STORAGE", "file");
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("SLEEPER_LEAGUE_ID", "111");
    vi.stubEnv("MY_ROSTER_ID", "1");
    const { getConfig } = await import("@/lib/config");
    // Settings saved before per-team keys existed (league-wide).
    await getConfig().storage.data.write("prefs-111", { key: "prefs-111", fetchedAt: "2026-01-01T00:00:00Z", data: { tradeBlock: ["player:9"] } });
    const prefs = await import("@/lib/prefs/store");
    expect((await prefs.readPrefs({ leagueId: "111", rosterId: 1 })).tradeBlock).toEqual(["player:9"]); // owner keeps them
    expect((await prefs.readPrefs({ leagueId: "111", rosterId: 2 })).tradeBlock).toEqual([]); // a friend doesn't see them
    await prefs.updatePrefs({ leagueId: "111", rosterId: 2 }, (p) => ({ ...p, targets: ["player:5"] }));
    expect((await prefs.readPrefs({ leagueId: "111", rosterId: 2 })).targets).toEqual(["player:5"]);
    expect((await prefs.readPrefs({ leagueId: "111", rosterId: 1 })).targets).toEqual([]);
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
