import { z } from "zod";
import type { LeagueModel } from "@/lib/analysis/types";
import { getConfig } from "@/lib/config";
import { notify, type DeliveryResult } from "@/lib/digest/run";
import { logger } from "@/lib/log";
import type { Prefs } from "@/lib/prefs/store";

const log = logger("alerts");
const KEY = (leagueId: string) => `alerts-state-${leagueId}`;

/** What the last check saw, so only changes are announced. */
const stateSchema = z.object({
  checkedAt: z.string(),
  /** My lineup players' injury status ("" = healthy). */
  injuries: z.record(z.string(), z.string()),
  /** Starred trade targets → owning roster (null = free agent). */
  targets: z.record(z.string(), z.number().nullable()),
});
export type AlertState = z.infer<typeof stateSchema>;
export type Alert = { kind: "injury" | "recovered" | "target-dropped"; text: string };

/** Statuses worth a push: the player may not play. Questionable is included; it's game-day relevant. */
const SERIOUS = /^(out|doubtful|questionable|ir|pup|sus|na|dnr|cov)/i;

export function snapshotFor(model: LeagueModel, prefs: Prefs): AlertState {
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  const injuries: Record<string, string> = {};
  for (const p of me?.players ?? []) {
    if (p.inBestLineup || p.slot === "starter") injuries[p.id] = p.injury?.status ?? "";
  }
  const owner = new Map<string, number>();
  for (const t of model.teams) for (const p of t.players) owner.set(p.assetId, t.team.rosterId);
  const targets: Record<string, number | null> = {};
  for (const id of prefs.targets) if (id.startsWith("player:")) targets[id] = owner.get(id) ?? null;
  return { checkedAt: new Date().toISOString(), injuries, targets };
}

/** Changes between two checks, as human-readable alerts. */
export function diffAlerts(model: LeagueModel, prev: AlertState, next: AlertState): Alert[] {
  const name = (id: string) => model.teams.flatMap((t) => t.players).find((p) => p.id === id || p.assetId === id)?.name ?? model.freeAgents.find((p) => p.assetId === id)?.name ?? id;
  const player = (id: string) => model.teams.flatMap((t) => t.players).find((p) => p.id === id);
  const out: Alert[] = [];
  for (const [id, status] of Object.entries(next.injuries)) {
    const before = prev.injuries[id];
    if (before === undefined || before === status) continue;
    const p = player(id);
    const detail = p?.injury?.bodyPart ? ` (${p.injury.bodyPart})` : "";
    if (SERIOUS.test(status)) out.push({ kind: "injury", text: `**${name(id)}** is now listed **${status}**${detail}${before ? ` (was ${before})` : ""}.` });
    else if (!status && SERIOUS.test(before)) out.push({ kind: "recovered", text: `**${name(id)}** no longer has an injury designation (was ${before}).` });
  }
  for (const [id, owner] of Object.entries(next.targets)) {
    const before = prev.targets[id];
    if (before == null || owner != null) continue; // only rostered → free agent
    const by = model.teams.find((t) => t.team.rosterId === before)?.team.teamName ?? "his team";
    out.push({ kind: "target-dropped", text: `Your trade target **${name(id)}** was dropped by ${by} and is a free agent now.` });
  }
  return out;
}

/**
 * Compare the league with the last check and push what changed (new injury designations on my
 * lineup, starred trade targets hitting waivers). The first run only records a baseline.
 */
export async function runAlerts(model: LeagueModel, prefs: Prefs, opts: { deliver?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ alerts: Alert[]; delivery: DeliveryResult[] }> {
  const store = getConfig().storage.data;
  const key = KEY(model.league.id);
  const prevParsed = stateSchema.safeParse((await store.read<unknown>(key))?.data);
  const next = snapshotFor(model, prefs);
  const alerts = prevParsed.success ? diffAlerts(model, prevParsed.data, next) : [];
  await store.write(key, { key, fetchedAt: next.checkedAt, data: next });
  let delivery: DeliveryResult[] = [];
  if (alerts.length && opts.deliver !== false) {
    const urgent = alerts.some((a) => a.kind === "injury" || a.kind === "target-dropped");
    delivery = await notify(
      { title: `${model.league.name}: ${alerts.length} update${alerts.length > 1 ? "s" : ""}`, text: alerts.map((a) => `• ${a.text}`).join("\n"), path: "/", tags: "rotating_light", priority: urgent ? "high" : "default" },
      opts.fetchImpl,
    );
  }
  log.info("alerts checked", { alerts: alerts.length, delivered: delivery.map((d) => `${d.channel}:${d.ok}`) });
  return { alerts, delivery };
}
