import { loadLeagueModel } from "@/lib/analysis/load-model";
import type { ActiveLeague } from "@/lib/league/active";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import { defaultTrades } from "@/lib/server/insights";
import { buildDigest, type Digest } from "./build";

const log = logger("digest");
/** Digests belong to a team in a league; the old league-wide keys are read as a fallback (owner's team). */
export type DigestOwner = { leagueId: string; rosterId: number | null };
const suffix = (o: DigestOwner) => `${o.leagueId}-${o.rosterId != null ? `r${o.rosterId}` : "guest"}`;
const LATEST = (o: DigestOwner) => `digest-latest-${suffix(o)}`;
const HISTORY = (o: DigestOwner) => `digest-history-${suffix(o)}`;
const isOwnerTeam = (o: DigestOwner) => {
  const c = getConfig();
  return o.rosterId != null && o.leagueId === c.leagueId && o.rosterId === c.myRosterId;
};

export async function readLatestDigest(o: DigestOwner): Promise<Digest | null> {
  const store = getConfig().storage.data;
  return (await store.read<Digest>(LATEST(o)))?.data ?? (isOwnerTeam(o) ? ((await store.read<Digest>(`digest-latest-${o.leagueId}`))?.data ?? null) : null);
}

export async function readDigestHistory(o: DigestOwner): Promise<Digest[]> {
  const store = getConfig().storage.data;
  return (await store.read<Digest[]>(HISTORY(o)))?.data ?? (isOwnerTeam(o) ? ((await store.read<Digest[]>(`digest-history-${o.leagueId}`))?.data ?? []) : []);
}

/** Refresh league data, build the digest against the previous one, and store it (shown in the app). */
export async function runDigest(opts: { active?: ActiveLeague } = {}): Promise<{ digest: Digest }> {
  const store = getConfig().storage.data;
  const { model, prefs } = await loadLeagueModel({ refresh: "league", active: opts.active });
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  const trades = me ? defaultTrades(model, prefs, me.strategy.effective, 6) : [];
  const id: DigestOwner = { leagueId: model.league.id, rosterId: model.myRosterId };
  const previous = await readLatestDigest(id);
  const digest = buildDigest(model, trades, previous?.memory ?? null);
  const now = new Date().toISOString();
  await store.write(LATEST(id), { key: LATEST(id), fetchedAt: now, data: digest });
  const history = [digest, ...(await readDigestHistory(id))].slice(0, 12);
  await store.write(HISTORY(id), { key: HISTORY(id), fetchedAt: now, data: history });
  log.info("digest built", { week: digest.week });
  return { digest };
}
