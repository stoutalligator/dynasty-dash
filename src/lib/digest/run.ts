import { loadLeagueModel } from "@/lib/analysis/load-model";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import { defaultTrades } from "@/lib/server/insights";
import { buildDigest, digestText, type Digest } from "./build";

const log = logger("digest");
const LATEST = (leagueId: string) => `digest-latest-${leagueId}`;
const HISTORY = (leagueId: string) => `digest-history-${leagueId}`;

export type DeliveryResult = { channel: string; ok: boolean; error?: string };

export async function readLatestDigest(leagueId: string): Promise<Digest | null> {
  return (await getConfig().storage.data.read<Digest>(LATEST(leagueId)))?.data ?? null;
}

export async function readDigestHistory(leagueId: string): Promise<Digest[]> {
  return (await getConfig().storage.data.read<Digest[]>(HISTORY(leagueId)))?.data ?? [];
}

/** Post the digest to the configured webhook (Discord/Slack/generic JSON) and/or ntfy topic. */
export async function deliverDigest(d: Digest, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult[]> {
  const c = getConfig();
  const text = digestText(d, c.appUrl);
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
        headers: { Title: `${d.league}: week ${d.week ?? ""} digest`, Tags: "football", ...(c.appUrl ? { Click: `${c.appUrl.replace(/\/$/, "")}/digest` } : {}) },
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
export async function runDigest(opts: { deliver: boolean }): Promise<{ digest: Digest; delivery: DeliveryResult[] }> {
  const store = getConfig().storage.data;
  const { model, prefs } = await loadLeagueModel({ refresh: "league" });
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  const trades = me ? defaultTrades(model, prefs, me.strategy.effective, 6) : [];
  const id = model.league.id;
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
