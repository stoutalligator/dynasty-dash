import { promises as fs } from "node:fs";
import path from "node:path";
import { getCache, type Cached } from "@/lib/cache/file-cache";
import { getConfig, type AppConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import { mapTeams } from "@/lib/players/map-players";
import { normalizePlayerDb } from "@/lib/players/normalize";
import { createSleeperClient, type SleeperClient } from "@/lib/sleeper/client";
import type { Issue, LeagueSnapshot, PlayerDb, SourceFreshness, Verification, WeekResult } from "./models";
import { normalizeLeague, normalizeMatchup, normalizeTransaction } from "./normalize";
import { resolvePickOwnership } from "./picks";

const log = logger("ingest");

const MIN = 60_000;
const HOUR = 60 * MIN;
export const TTL = {
  league: 15 * MIN,
  users: HOUR,
  rosters: 10 * MIN,
  tradedPicks: 30 * MIN,
  drafts: 6 * HOUR,
  nflState: HOUR,
  currentWeek: 10 * MIN,
  pastWeek: 24 * HOUR,
  players: 24 * HOUR,
} as const;

/** "league" refreshes everything except the ~15 MB player database; "all" includes it. */
export type RefreshScope = "none" | "league" | "all";

export type LoadOptions = {
  refresh?: RefreshScope;
  config?: AppConfig;
  client?: SleeperClient;
};

function freshness(c: Cached<unknown>): SourceFreshness {
  return { fetchedAt: c.fetchedAt, source: c.source, stale: c.stale, ...(c.error ? { error: c.error } : {}) };
}

/** Cached access to the Sleeper player database, normalized; the raw response is kept for debugging. */
export async function getPlayerDb(opts: { force?: boolean; config?: AppConfig; client?: SleeperClient } = {}) {
  const config = opts.config ?? getConfig();
  const client = opts.client ?? createSleeperClient();
  const cache = getCache(config.cacheDir);
  return cache.getOrFetch<PlayerDb>(
    "players-nfl",
    async () => {
      const raw = await client.players({
        onRaw: async (body) => {
          await fs.mkdir(path.join(config.cacheDir, "raw"), { recursive: true });
          await fs.writeFile(path.join(config.cacheDir, "raw", "players-nfl.json"), JSON.stringify(body));
        },
      });
      return normalizePlayerDb(raw);
    },
    { ttlMs: TTL.players, force: opts.force },
  );
}

let memo: { key: string; snapshot: LeagueSnapshot } | undefined;

/**
 * Load every league source (each with its own cache TTL), normalize it, and assemble a snapshot.
 * Failures are recorded as issues; stale caches are served when a refresh fails. Nothing is fabricated:
 * if a required source has never been fetched successfully, this throws.
 */
export async function loadLeagueSnapshot(opts: LoadOptions = {}): Promise<LeagueSnapshot> {
  const config = opts.config ?? getConfig();
  const client = opts.client ?? createSleeperClient();
  const cache = getCache(config.cacheDir);
  const refresh = opts.refresh ?? "none";
  const force = refresh !== "none";
  const id = config.leagueId;
  const issues: Issue[] = [];
  const fresh: Record<string, SourceFreshness> = {};

  const k = (name: string) => `league-${id}-${name}`;
  const [leagueC, usersC, rostersC, tradedC, draftsC, playersC] = await Promise.all([
    cache.getOrFetch(k("league"), () => client.league(id), { ttlMs: TTL.league, force }),
    cache.getOrFetch(k("users"), () => client.users(id), { ttlMs: TTL.users, force }),
    cache.getOrFetch(k("rosters"), () => client.rosters(id), { ttlMs: TTL.rosters, force }),
    cache.getOrFetch(k("traded-picks"), () => client.tradedPicks(id), { ttlMs: TTL.tradedPicks, force }),
    cache.getOrFetch(k("drafts"), () => client.drafts(id), { ttlMs: TTL.drafts, force }),
    getPlayerDb({ force: refresh === "all", config, client }),
  ]);
  fresh.league = freshness(leagueC);
  fresh.users = freshness(usersC);
  fresh.rosters = freshness(rostersC);
  fresh.tradedPicks = freshness(tradedC);
  fresh.drafts = freshness(draftsC);
  fresh.players = freshness(playersC);

  const league = normalizeLeague(leagueC.data);
  if (league.id !== id) {
    issues.push({ level: "error", code: "league-id-mismatch", message: `Configured league ${id} but API returned ${league.id}.` });
  }

  // Weekly data: transactions are keyed by "round" (= week), matchups by week.
  const currentWeek = Math.max(league.currentWeek ?? 1, 1);
  const lastScored = league.lastScoredWeek ?? 0;
  const weekNums = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const ttlFor = (w: number) => (w < currentWeek && w <= lastScored ? TTL.pastWeek : TTL.currentWeek);

  const txResults = await Promise.allSettled(
    weekNums.map((w) => cache.getOrFetch(k(`tx-${w}`), () => client.transactions(id, w), { ttlMs: ttlFor(w), force })),
  );
  const mResults = await Promise.allSettled(
    weekNums.filter((w) => w <= Math.max(lastScored, 0) || w === currentWeek).map((w) =>
      cache.getOrFetch(k(`matchups-${w}`), () => client.matchups(id, w), { ttlMs: ttlFor(w), force }).then((c) => ({ w, c })),
    ),
  );

  const transactions = txResults.flatMap((r, i) => {
    if (r.status === "rejected") {
      issues.push({ level: "warning", code: "transactions-unavailable", message: `Transactions for week ${weekNums[i]} could not be loaded: ${String(r.reason)}` });
      return [];
    }
    if (r.value.stale) fresh[`transactions-${weekNums[i]}`] = freshness(r.value);
    return r.value.data.map(normalizeTransaction);
  });
  transactions.sort((a, b) => b.createdAt - a.createdAt);
  if (txResults[0]?.status === "fulfilled") fresh.transactions = freshness(txResults[0].value);

  const weeks: WeekResult[] = [];
  for (const r of mResults) {
    if (r.status === "rejected") {
      issues.push({ level: "warning", code: "matchups-unavailable", message: `Matchups could not be loaded: ${String(r.reason)}` });
      continue;
    }
    const entries = r.value.c.data.map(normalizeMatchup);
    if (entries.some((e) => e.points > 0)) weeks.push({ week: r.value.w, complete: r.value.w <= lastScored, entries });
    fresh.matchups = freshness(r.value.c);
  }
  weeks.sort((a, b) => a.week - b.week);

  const { verification, myRosterId } = verify(config, league.name, rostersC.data.map((r) => r.roster_id), usersC.data, rostersC.data);
  if (verification.myRosterId == null) {
    issues.push({ level: "error", code: "my-team-unverified", message: verification.notes.join(" ") || "Could not identify your team." });
  }

  const { teams, issues: mapIssues } = mapTeams({
    rosters: rostersC.data,
    users: usersC.data,
    players: playersC.data,
    startingSlots: league.startingSlots,
    divisionNames: Object.fromEntries(league.divisions.map((d) => [d.id, d.name])),
    myRosterId,
  });
  issues.push(...mapIssues);

  const { picks, seasons, issues: pickIssues } = resolvePickOwnership({
    leagueSeason: league.season,
    draftRounds: league.draftRounds,
    rosterIds: teams.map((t) => t.rosterId),
    drafts: draftsC.data,
    tradedPicks: tradedC.data,
    futureSeasons: config.futurePickSeasons,
  });
  issues.push(...pickIssues);

  for (const [name, f] of Object.entries(fresh)) {
    if (f.stale) issues.push({ level: "warning", code: "stale-source", message: `Refreshing ${name} failed (${f.error}); showing data from ${f.fetchedAt}.` });
  }
  if (lastScored === 0) issues.push({ level: "info", code: "no-scored-weeks", message: "No weeks have been scored yet; production-based analysis is unavailable." });

  const snapshot: LeagueSnapshot = {
    generatedAt: new Date().toISOString(),
    league,
    teams,
    picks,
    pickSeasons: seasons,
    transactions,
    weeks,
    players: playersC.data,
    freshness: fresh,
    issues,
    verification,
  };

  // Reuse the previous snapshot object when no source changed, so downstream memoization holds.
  const key = JSON.stringify([Object.entries(fresh).map(([k, f]) => [k, f.fetchedAt, f.stale]), transactions.length, weeks.map((w) => w.week), issues.length]);
  if (memo && memo.key === key) return memo.snapshot;
  memo = { key, snapshot };
  log.info("snapshot built", { teams: teams.length, transactions: transactions.length, weeks: weeks.length, issues: issues.length });
  return snapshot;
}

function verify(
  config: AppConfig,
  leagueName: string,
  rosterIds: number[],
  users: { user_id: string; display_name: string; metadata?: { team_name?: string } | null }[],
  rosters: { roster_id: number; owner_id: string | null }[],
): { verification: Verification; myRosterId: number | null } {
  const notes: string[] = [];
  const nameOf = (rid: number) => {
    const owner = users.find((u) => u.user_id === rosters.find((r) => r.roster_id === rid)?.owner_id);
    return owner?.metadata?.team_name?.trim() || owner?.display_name || null;
  };
  const norm = (s: string) => s.trim().toLowerCase();
  let myRosterId: number | null = null;

  if (config.myRosterId != null) {
    if (rosterIds.includes(config.myRosterId)) {
      myRosterId = config.myRosterId;
      const actual = nameOf(myRosterId);
      if (config.expectedTeamName && actual && norm(actual) !== norm(config.expectedTeamName)) {
        notes.push(`Roster ${myRosterId} is named "${actual}", not the expected "${config.expectedTeamName}". Using the live name.`);
      }
    } else {
      notes.push(`Configured MY_ROSTER_ID ${config.myRosterId} does not exist in this league.`);
    }
  }
  if (myRosterId == null && config.expectedTeamName) {
    const match = rosterIds.find((rid) => {
      const n = nameOf(rid);
      return n != null && norm(n) === norm(config.expectedTeamName!);
    });
    if (match != null) {
      myRosterId = match;
      notes.push(`Identified your team by name "${config.expectedTeamName}" (roster ${match}).`);
    } else {
      notes.push(`No team named "${config.expectedTeamName}" was found.`);
    }
  }
  return {
    myRosterId,
    verification: {
      configuredLeagueId: config.leagueId,
      leagueFound: !!leagueName,
      expectedRosterId: config.myRosterId ?? null,
      expectedTeamName: config.expectedTeamName ?? null,
      myRosterId,
      myTeamName: myRosterId != null ? nameOf(myRosterId) : null,
      notes,
    },
  };
}
