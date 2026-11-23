import { z } from "zod";
import type { LeagueModel } from "@/lib/analysis/types";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";

const log = logger("snapshots");

/** One day's league state, kept so trends (odds, value, power rank) can be charted over time. */
const teamSnapSchema = z.object({
  rosterId: z.number(),
  playoffPct: z.number().nullable(),
  titlePct: z.number().nullable(),
  totalValue: z.number(),
  powerRank: z.number(),
  wins: z.number(),
  losses: z.number(),
});
const snapSchema = z.object({ date: z.string(), week: z.number().nullable(), teams: z.array(teamSnapSchema) });
export type DailySnapshot = z.infer<typeof snapSchema>;

const KEY = (leagueId: string) => `snapshots-${leagueId}`;
/** About two seasons of daily points; old ones are dropped. */
const MAX = 800;

const today = () => new Date().toISOString().slice(0, 10);

export async function readSnapshots(leagueId: string): Promise<DailySnapshot[]> {
  try {
    const parsed = z.array(snapSchema).safeParse((await getConfig().storage.data.read<unknown>(KEY(leagueId)))?.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function snapshotOf(model: LeagueModel, date = today()): DailySnapshot {
  return {
    date,
    week: model.league.currentWeek,
    teams: model.teams.map((t) => {
      const o = model.odds?.teams.find((x) => x.rosterId === t.team.rosterId);
      return {
        rosterId: t.team.rosterId,
        playoffPct: o ? Math.round(o.playoffPct * 1000) / 1000 : null,
        titlePct: o ? Math.round(o.titlePct * 1000) / 1000 : null,
        totalValue: Math.round(t.totals.totalValue),
        powerRank: t.powerRank,
        wins: t.team.wins,
        losses: t.team.losses,
      };
    }),
  };
}

const recorded = new Map<string, string>();

/**
 * Save today's snapshot (once per league per day; later calls the same day replace it so the day
 * ends with its latest numbers). Cheap enough to call after any page render.
 */
export async function recordSnapshot(model: LeagueModel): Promise<void> {
  const id = model.league.id;
  const date = today();
  const stampKey = `${id}:${date}:${model.generatedAt}`;
  if (recorded.get(id) === stampKey) return;
  recorded.set(id, stampKey);
  try {
    const list = (await readSnapshots(id)).filter((s) => s.date !== date);
    list.push(snapshotOf(model, date));
    list.sort((a, b) => a.date.localeCompare(b.date));
    await getConfig().storage.data.write(KEY(id), { key: KEY(id), fetchedAt: new Date().toISOString(), data: list.slice(-MAX) });
  } catch (err) {
    recorded.delete(id);
    log.warn("snapshot not saved", { error: String(err) });
  }
}

/** Power-rank change vs. the latest snapshot at least `days` old (positive = moved up). */
export function rankMovement(snaps: DailySnapshot[], model: LeagueModel, days = 6): Map<number, number> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const base = [...snaps].reverse().find((s) => s.date <= cutoff);
  const out = new Map<number, number>();
  if (!base) return out;
  for (const t of model.teams) {
    const was = base.teams.find((x) => x.rosterId === t.team.rosterId)?.powerRank;
    if (was != null) out.set(t.team.rosterId, was - t.powerRank);
  }
  return out;
}
