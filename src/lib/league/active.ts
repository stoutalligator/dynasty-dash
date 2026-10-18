import { z } from "zod";
import { getConfig } from "@/lib/config";

/**
 * Which league the app is showing, and how to recognise "my" team in it. Chosen in the app
 * (/setup) and stored in the data store; environment variables are only a fallback default.
 */
export const selectionSchema = z.object({
  leagueId: z.string().regex(/^\d+$/),
  leagueName: z.string().optional(),
  season: z.string().optional(),
  /** Sleeper account of the person using the app (identifies their team automatically). */
  userId: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  /** Explicit team choice when the app was set up by league id instead of username. */
  rosterId: z.number().int().positive().nullable().default(null),
  /** Recently used leagues, for the switcher. */
  recent: z
    .array(z.object({ leagueId: z.string(), name: z.string(), season: z.string(), avatar: z.string().nullable().optional() }))
    .default([]),
  selectedAt: z.string(),
});
export type LeagueSelection = z.infer<typeof selectionSchema>;

export type ActiveLeague = {
  leagueId: string;
  source: "app" | "env";
  userId: string | null;
  username: string | null;
  rosterId: number | null;
  expectedTeamName: string | null;
  recent: LeagueSelection["recent"];
};

const KEY = "league-selection";

export async function readSelection(): Promise<LeagueSelection | null> {
  try {
    const parsed = selectionSchema.safeParse((await getConfig().storage.data.read<unknown>(KEY))?.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeSelection(sel: LeagueSelection): Promise<void> {
  const valid = selectionSchema.parse(sel);
  await getConfig().storage.data.write(KEY, { key: KEY, fetchedAt: new Date().toISOString(), data: valid });
}

/** In-app selection first, then SLEEPER_LEAGUE_ID (+ MY_ROSTER_ID / EXPECTED_TEAM_NAME); null → run setup. */
export async function resolveActiveLeague(): Promise<ActiveLeague | null> {
  const sel = await readSelection();
  if (sel) {
    return { leagueId: sel.leagueId, source: "app", userId: sel.userId, username: sel.username, rosterId: sel.rosterId, expectedTeamName: null, recent: sel.recent };
  }
  const c = getConfig();
  if (!c.leagueId) return null;
  return { leagueId: c.leagueId, source: "env", userId: null, username: null, rosterId: c.myRosterId ?? null, expectedTeamName: c.expectedTeamName ?? null, recent: [] };
}

export const LEAGUE_TYPE: Record<number, string> = { 0: "Redraft", 1: "Keeper", 2: "Dynasty", 3: "Guillotine" };
