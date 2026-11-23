import { cookies } from "next/headers";
import { z } from "zod";
import { getConfig } from "@/lib/config";

/**
 * Which league the app is showing, and how to recognise "my" team in it. Each visitor chooses in
 * the app (/setup: Sleeper username → league); environment variables configure scheduled jobs.
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

/**
 * The visitor's choice lives in a browser-session cookie (no expiry: it ends when the browser
 * closes), so nobody's account is remembered on the server and each person picks their own league.
 */
export { SELECTION_COOKIE } from "./session";
import { SELECTION_COOKIE } from "./session";

const encode = (sel: LeagueSelection) => Buffer.from(JSON.stringify(sel), "utf8").toString("base64url");
export function decodeSelection(raw: string | undefined): LeagueSelection | null {
  if (!raw) return null;
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The visitor's selection, or null (also null outside a request, e.g. scripts and cron). */
export async function readSelection(): Promise<LeagueSelection | null> {
  try {
    return decodeSelection((await cookies()).get(SELECTION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Save the visitor's selection for this browser session (server actions only). */
export async function writeSelection(sel: LeagueSelection): Promise<void> {
  const valid = selectionSchema.parse(sel);
  (await cookies()).set(SELECTION_COOKIE, encode(valid), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSelection(): Promise<void> {
  (await cookies()).delete(SELECTION_COOKIE);
}

/** The owner's league from SLEEPER_LEAGUE_ID (+ MY_ROSTER_ID / EXPECTED_TEAM_NAME), for scheduled jobs. */
export function defaultLeague(): ActiveLeague | null {
  const c = getConfig();
  if (!c.leagueId) return null;
  return { leagueId: c.leagueId, source: "env", userId: null, username: null, rosterId: c.myRosterId ?? null, expectedTeamName: c.expectedTeamName ?? null, recent: [] };
}

/**
 * In a request: the visitor's selection, or null (they are sent to /setup to enter their Sleeper
 * username). Outside a request (scripts): the environment default league.
 */
export async function resolveActiveLeague(): Promise<ActiveLeague | null> {
  let jar: Awaited<ReturnType<typeof cookies>>;
  try {
    jar = await cookies();
  } catch {
    return defaultLeague();
  }
  const sel = decodeSelection(jar.get(SELECTION_COOKIE)?.value);
  if (!sel) return null;
  return { leagueId: sel.leagueId, source: "app", userId: sel.userId, username: sel.username, rosterId: sel.rosterId, expectedTeamName: null, recent: sel.recent };
}

export const LEAGUE_TYPE: Record<number, string> = { 0: "Redraft", 1: "Keeper", 2: "Dynasty", 3: "Guillotine" };
