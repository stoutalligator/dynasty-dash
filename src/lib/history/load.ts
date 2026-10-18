import { getCache } from "@/lib/cache/file-cache";
import { getConfig } from "@/lib/config";
import type { Issue, Transaction } from "@/lib/league/models";
import { normalizeTransaction } from "@/lib/league/normalize";
import { logger } from "@/lib/log";
import { createSleeperClient, type SleeperClient } from "@/lib/sleeper/client";
import type { SleeperDraft, SleeperDraftPick, SleeperLeague, SleeperRoster, SleeperUser } from "@/lib/sleeper/schemas";

const log = logger("history");
const HOUR = 3600_000;

export type HistoricalDraft = {
  draftId: string;
  season: string;
  status: string;
  /** user id → draft slot (Sleeper draft_order). */
  draftOrder: Record<string, number>;
  /** draft slot → original roster id (from the draft detail endpoint); preferred when present. */
  slotToRoster: Record<string, number>;
  picks: SleeperDraftPick[];
};

export type HistoricalSeason = {
  leagueId: string;
  season: string;
  status: string;
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  /** roster id → owner user id for this season. */
  rosterOwner: Record<number, string | null>;
  /** Final placements from the winners bracket: roster id → place (1 = champion). */
  placements: Record<number, number>;
  transactions: Transaction[];
  drafts: HistoricalDraft[];
};

export type LeagueHistory = { seasons: HistoricalSeason[]; issues: Issue[] };

async function draftSlots(draftId: string, client: SleeperClient, force: boolean): Promise<Record<string, number>> {
  try {
    const d = (await getCache(getConfig().cacheDir).getOrFetch(`draft-${draftId}`, () => client.draft(draftId), { ttlMs: 7 * 24 * HOUR, force })).data;
    return Object.fromEntries(Object.entries(d.slot_to_roster_id ?? {}).filter(([slot, rid]) => slot !== "" && rid != null)) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Placement games: `p` = 1 is the final; the winner is 1st, the loser 2nd; p = 3 → 3rd/4th, etc. */
export function placementsFromBracket(bracket: { p?: number | null; w?: number | null; l?: number | null }[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of bracket) {
    if (m.p == null) continue;
    if (m.w != null) out[m.w] = m.p;
    if (m.l != null) out[m.l] = m.p + 1;
  }
  return out;
}

async function loadSeason(leagueId: string, client: SleeperClient, force: boolean): Promise<HistoricalSeason> {
  const cache = getCache(getConfig().cacheDir);
  const k = (name: string) => `history-${leagueId}-${name}`;
  const league = (await cache.getOrFetch(k("league"), () => client.league(leagueId), { ttlMs: 24 * HOUR, force })).data;
  // A completed season is effectively immutable, so it is cached for a week.
  const ttl = league.status === "complete" ? 7 * 24 * HOUR : HOUR;
  const [users, rosters, bracket, drafts] = await Promise.all([
    cache.getOrFetch(k("users"), () => client.users(leagueId), { ttlMs: ttl, force }),
    cache.getOrFetch(k("rosters"), () => client.rosters(leagueId), { ttlMs: ttl, force }),
    cache.getOrFetch(k("winners"), () => client.winnersBracket(leagueId), { ttlMs: ttl, force }).catch(() => null),
    cache.getOrFetch(k("drafts"), () => client.drafts(leagueId), { ttlMs: ttl, force }),
  ]);
  const lastLeg = Math.max(18, (league.settings.last_scored_leg ?? 0) + 1);
  const legs = league.status === "complete" ? Array.from({ length: lastLeg }, (_, i) => i + 1) : [];
  const txs = await Promise.all(
    legs.map((w) => cache.getOrFetch(k(`tx-${w}`), () => client.transactions(leagueId, w), { ttlMs: ttl, force }).then((c) => c.data).catch(() => [])),
  );
  const draftList: HistoricalDraft[] = await Promise.all(
    drafts.data
      .filter((d: SleeperDraft) => d.status === "complete")
      .map(async (d: SleeperDraft) => ({
        draftId: d.draft_id,
        season: d.season,
        status: d.status,
        draftOrder: d.draft_order ?? {},
        slotToRoster: await draftSlots(d.draft_id, client, force),
        picks: (await cache.getOrFetch(`draft-${d.draft_id}-picks`, () => client.draftPicks(d.draft_id), { ttlMs: 7 * 24 * HOUR, force })).data,
      })),
  );
  return {
    leagueId,
    season: league.season,
    status: league.status,
    league,
    users: users.data,
    rosters: rosters.data,
    rosterOwner: Object.fromEntries(rosters.data.map((r) => [r.roster_id, r.owner_id])),
    placements: bracket ? placementsFromBracket(bracket.data) : {},
    transactions: txs.flat().map(normalizeTransaction).filter((t) => t.status === "complete"),
    drafts: draftList,
  };
}

/**
 * Walk the previous_league_id chain (up to `maxSeasons` back) and load each prior season, plus the
 * current league's completed drafts. Failures are reported as issues; partial history is still returned.
 */
export async function loadLeagueHistory(opts: {
  currentLeagueId: string;
  previousLeagueId: string | null;
  maxSeasons?: number;
  force?: boolean;
  client?: SleeperClient;
}): Promise<LeagueHistory> {
  const client = opts.client ?? createSleeperClient();
  const issues: Issue[] = [];
  const seasons: HistoricalSeason[] = [];
  let id = opts.previousLeagueId;
  for (let i = 0; id && id !== "0" && i < (opts.maxSeasons ?? 4); i++) {
    try {
      const s = await loadSeason(id, client, !!opts.force);
      seasons.push(s);
      id = s.league.previous_league_id ?? null;
    } catch (err) {
      issues.push({ level: "warning", code: "history-unavailable", message: `Could not load previous league ${id}: ${String(err)}` });
      break;
    }
  }
  // Current season: only its completed drafts are needed here (transactions come from the snapshot).
  try {
    const cur = await loadSeasonDraftsOnly(opts.currentLeagueId, client, !!opts.force);
    if (cur) seasons.unshift(cur);
  } catch (err) {
    issues.push({ level: "info", code: "current-draft-unavailable", message: `Current rookie draft results unavailable: ${String(err)}` });
  }
  log.debug("history loaded", { seasons: seasons.map((s) => s.season) });
  return { seasons, issues };
}

async function loadSeasonDraftsOnly(leagueId: string, client: SleeperClient, force: boolean): Promise<HistoricalSeason | null> {
  const cache = getCache(getConfig().cacheDir);
  const league = (await cache.getOrFetch(`league-${leagueId}-league`, () => client.league(leagueId), { ttlMs: 15 * 60_000 })).data;
  const [users, rosters, drafts] = await Promise.all([
    cache.getOrFetch(`league-${leagueId}-users`, () => client.users(leagueId), { ttlMs: HOUR }),
    cache.getOrFetch(`league-${leagueId}-rosters`, () => client.rosters(leagueId), { ttlMs: 10 * 60_000 }),
    cache.getOrFetch(`league-${leagueId}-drafts`, () => client.drafts(leagueId), { ttlMs: 6 * HOUR }),
  ]);
  const done = drafts.data.filter((d) => d.status === "complete");
  return {
    leagueId,
    season: league.season,
    status: league.status,
    league,
    users: users.data,
    rosters: rosters.data,
    rosterOwner: Object.fromEntries(rosters.data.map((r) => [r.roster_id, r.owner_id])),
    placements: {},
    transactions: [],
    drafts: await Promise.all(
      done.map(async (d) => ({
        draftId: d.draft_id,
        season: d.season,
        status: d.status,
        draftOrder: d.draft_order ?? {},
        slotToRoster: await draftSlots(d.draft_id, client, force),
        picks: (await cache.getOrFetch(`draft-${d.draft_id}-picks`, () => client.draftPicks(d.draft_id), { ttlMs: 7 * 24 * HOUR, force })).data,
      })),
    ),
  };
}
