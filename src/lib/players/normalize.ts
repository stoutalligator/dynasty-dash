import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import type { PlayerDb, PlayerInfo } from "@/lib/league/models";

/** Age in years (one decimal) from an ISO birth date, relative to `asOf`. */
export function ageFromBirthDate(birthDate: string, asOf: Date = new Date()): number | null {
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const years = (asOf.getTime() - born.getTime()) / (365.2425 * 24 * 3600 * 1000);
  return years > 0 && years < 60 ? Math.round(years * 10) / 10 : null;
}

export function normalizePlayer(p: SleeperPlayer, asOf: Date = new Date()): PlayerInfo {
  const name =
    p.full_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    (p.position === "DEF" ? `${p.team ?? p.player_id} D/ST` : `Player ${p.player_id}`);
  const age = (p.birth_date ? ageFromBirthDate(p.birth_date, asOf) : null) ?? p.age ?? null;
  return {
    id: p.player_id,
    name,
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    position: p.position ?? null,
    fantasyPositions: p.fantasy_positions ?? (p.position ? [p.position] : []),
    nflTeam: p.team ?? null,
    age,
    yearsExp: p.years_exp ?? null,
    status: p.status ?? null,
    active: p.active ?? null,
    injury: p.injury_status
      ? {
          status: p.injury_status,
          bodyPart: p.injury_body_part ?? null,
          notes: p.injury_notes ?? null,
          practice: p.practice_participation ?? null,
        }
      : null,
    depthChartOrder: p.depth_chart_order ?? null,
    newsUpdated: p.news_updated ?? null,
    mapped: true,
  };
}

export function normalizePlayerDb(raw: Record<string, SleeperPlayer>, asOf: Date = new Date()): PlayerDb {
  const db: PlayerDb = {};
  for (const [id, p] of Object.entries(raw)) db[id] = normalizePlayer({ ...p, player_id: p.player_id || id }, asOf);
  return db;
}

/** Placeholder for ids missing from the player database: kept, never dropped or guessed. */
export function unknownPlayer(id: string): PlayerInfo {
  return {
    id,
    name: `Unknown player (${id})`,
    firstName: null,
    lastName: null,
    position: null,
    fantasyPositions: [],
    nflTeam: null,
    age: null,
    yearsExp: null,
    status: null,
    active: null,
    injury: null,
    depthChartOrder: null,
    newsUpdated: null,
    mapped: false,
  };
}

export function lookupPlayer(db: PlayerDb, id: string): PlayerInfo {
  return db[id] ?? unknownPlayer(id);
}

/** Injury statuses that mean a player is not expected to play this week. */
export const UNAVAILABLE_STATUSES = new Set(["Out", "IR", "PUP", "Sus", "NA", "DNR", "COV"]);

export function isUnavailable(p: PlayerInfo): boolean {
  return !!p.injury && UNAVAILABLE_STATUSES.has(p.injury.status);
}
