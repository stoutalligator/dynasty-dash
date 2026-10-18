"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { readSelection, writeSelection } from "@/lib/league/active";
import { findUserLeagues, lookupLeague } from "@/lib/league/discover";
import { createSleeperClient } from "@/lib/sleeper/client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

export async function findLeaguesAction(username: string): Promise<Result<Awaited<ReturnType<typeof findUserLeagues>>>> {
  try {
    return { ok: true, data: await findUserLeagues(z.string().max(60).parse(username)) };
  } catch (err) {
    return fail(err);
  }
}

export async function lookupLeagueAction(leagueId: string): Promise<Result<Awaited<ReturnType<typeof lookupLeague>>>> {
  try {
    return { ok: true, data: await lookupLeague(z.string().max(30).parse(leagueId)) };
  } catch (err) {
    return fail(err);
  }
}

const chooseSchema = z.object({
  leagueId: z.string().regex(/^\d+$/),
  userId: z.string().regex(/^\d+$/).nullable().default(null),
  username: z.string().max(60).nullable().default(null),
  rosterId: z.number().int().positive().nullable().default(null),
});

/** Save the chosen league (and how to recognise your team), then open the dashboard. */
export async function chooseLeagueAction(input: z.input<typeof chooseSchema>): Promise<Result<null>> {
  let target = "/";
  try {
    const c = chooseSchema.parse(input);
    const league = await createSleeperClient().league(c.leagueId);
    const prev = await readSelection();
    const entry = { leagueId: league.league_id, name: league.name, season: league.season, avatar: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null };
    await writeSelection({
      leagueId: league.league_id,
      leagueName: league.name,
      season: league.season,
      // Keep the account across switches so the team is recognised in every league.
      userId: c.userId ?? (c.rosterId == null ? (prev?.userId ?? null) : null),
      username: c.username ?? (c.rosterId == null ? (prev?.username ?? null) : null),
      rosterId: c.rosterId,
      recent: [entry, ...(prev?.recent ?? []).filter((r) => r.leagueId !== entry.leagueId)].slice(0, 8),
      selectedAt: new Date().toISOString(),
    });
    target = "/";
  } catch (err) {
    return fail(err);
  }
  redirect(target);
}
