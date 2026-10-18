import type { SleeperRoster, SleeperUser } from "@/lib/sleeper/schemas";
import type { PlayerDb } from "@/lib/league/models";
import { normalizePlayer } from "@/lib/players/normalize";

const asOf = new Date("2026-10-18T00:00:00Z");
const p = (player_id: string, full_name: string, position: string, team: string, birth_date: string, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ player_id, full_name, position, team, birth_date, fantasy_positions: [position], ...extra }, asOf);

export const db: PlayerDb = Object.fromEntries(
  [
    p("q1", "QB One", "QB", "BUF", "1996-05-21"),
    p("q2", "QB Two", "QB", "KC", "2001-01-01"),
    p("q3", "QB Three", "QB", "NYG", "2003-01-01"),
    p("r1", "RB One", "RB", "ATL", "2002-01-01"),
    p("r2", "RB Two", "RB", "DET", "1998-01-01", { injury_status: "Out", injury_body_part: "Ankle" }),
    p("r3", "RB Three", "RB", "HOU", "2001-01-01"),
    p("w1", "WR One", "WR", "LAR", "2001-05-01"),
    p("w2", "WR Two", "WR", "DAL", "2000-01-01"),
    p("w3", "WR Three", "WR", "ARI", "1996-01-01"),
    p("w4", "WR Four", "WR", "CHI", "2004-01-01"),
    p("t1", "TE One", "TE", "LV", "2003-01-01"),
  ].map((x) => [x.id, x]),
);

export const users: SleeperUser[] = [
  { user_id: "u1", display_name: "fiesterfamine", avatar: "abc", metadata: { team_name: "Fiester Famine" } },
  { user_id: "u2", display_name: "rival", avatar: null, metadata: {} },
];

export const roster = (overrides: Partial<SleeperRoster> = {}): SleeperRoster => ({
  roster_id: 1,
  owner_id: "u1",
  players: ["q1", "q2", "r1", "r2", "w1", "w2", "w3", "t1", "w4", "q3", "missing9"],
  starters: ["q1", "r1", "w1", "t1", "q2"],
  taxi: ["w4"],
  reserve: ["r2"],
  settings: { wins: 5, losses: 5, ties: 0, fpts: 582, fpts_decimal: 86, ppts: 680, ppts_decimal: 38, division: 1 },
  metadata: { streak: "3W", record: "WLLLWLLWWW" },
  ...overrides,
});
