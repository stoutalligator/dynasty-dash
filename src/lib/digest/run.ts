import { loadLeagueModel } from "@/lib/analysis/load-model";
import type { ActiveLeague } from "@/lib/league/active";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import { defaultTrades } from "@/lib/server/insights";
import { buildDigest, digestText, type Digest } from "./build";

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

export type DeliveryResult = { channel: string; ok: boolean; error?: string };

export async function readLatestDigest(o: DigestOwner): Promise<Digest | null> {
  const store = getConfig().storage.data;
  return (await store.read<Digest>(LATEST(o)))?.data ?? (isOwnerTeam(o) ? ((await store.read<Digest>(`digest-latest-${o.leagueId}`))?.data ?? null) : null);
}

export async function readDigestHistory(o: DigestOwner): Promise<Digest[]> {
  const store = getConfig().storage.data;
  return (await store.read<Digest[]>(HISTORY(o)))?.data ?? (isOwnerTeam(o) ? ((await store.read<Digest[]>(`digest-history-${o.leagueId}`))?.data ?? []) : []);
}

/** Post the digest to the configured webhook (Discord/Slack/generic JSON) and/or ntfy topic. */
export async function deliverDigest(d: Digest, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult[]> {
  const c = getConfig();
  return notify(
    { title: `${d.league}: week ${d.week ?? ""} digest`, text: digestText(d, c.appUrl), path: "/digest", tags: "football" },
    fetchImpl,
  );
}

/**
 * Send a message to every configured channel: a Discord/Slack/generic webhook (DIGEST_WEBHOOK_URL)
 * and/or an ntfy topic (NTFY_TOPIC). Text may use **bold** / __underline__ markdown.
 */
export async function notify(
  msg: { title: string; text: string; path?: string; tags?: string; priority?: "default" | "high" },
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult[]> {
  const c = getConfig();
  const text = msg.text;
  const out: DeliveryResult[] = [];
  if (c.digestWebhookUrl) {
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(c.digestWebhookUrl);
    const isSlack = /hooks\.slack\.com/.test(c.digestWebhookUrl);
    const body = isDiscord ? { content: text.slice(0, 1990) } : isSlack ? { text: text.replace(/\*\*/g, "*").replace(/__/g, "_") } : { text, content: text };
    try {
      const res = await fetchImpl(c.digestWebhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      out.push({ channel: isDiscord ? "discord" : isSlack ? "slack" : "webhook", ok: res.ok, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) });
    } catch (err) {
      out.push({ channel: "webhook", ok: false, error: String(err) });
    }
  }
  if (c.ntfyTopic) {
    try {
      const res = await fetchImpl(`https://ntfy.sh/${c.ntfyTopic}`, {
        method: "POST",
        headers: {
          Title: msg.title,
          Tags: msg.tags ?? "football",
          ...(msg.priority === "high" ? { Priority: "high" } : {}),
          ...(c.appUrl && msg.path ? { Click: `${c.appUrl.replace(/\/$/, "")}${msg.path}` } : {}),
        },
        body: text.replace(/\*\*|__/g, ""),
        signal: AbortSignal.timeout(15_000),
      });
      out.push({ channel: "ntfy", ok: res.ok, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) });
    } catch (err) {
      out.push({ channel: "ntfy", ok: false, error: String(err) });
    }
  }
  return out;
}

/** Refresh league data, build the digest against the previous one, store it, and optionally deliver it. */
export async function runDigest(opts: { deliver: boolean; active?: ActiveLeague }): Promise<{ digest: Digest; delivery: DeliveryResult[] }> {
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
  const delivery = opts.deliver ? await deliverDigest(digest) : [];
  log.info("digest built", { week: digest.week, delivered: delivery.map((d) => `${d.channel}:${d.ok}`) });
  return { digest, delivery };
}
