import { z } from "zod";
import { getConfig } from "@/lib/config";

export const strategySchema = z.enum(["contender", "retool", "rebuild"]);
export type Strategy = z.infer<typeof strategySchema>;

export const savedProposalSchema = z.object({
  id: z.string(),
  savedAt: z.string(),
  partnerRosterId: z.number(),
  /** Asset ids ("player:<id>" or "pick:<season>:<round>:<originalRosterId>"). */
  myAssets: z.array(z.string()),
  theirAssets: z.array(z.string()),
  note: z.string().max(500).optional(),
});
export type SavedProposal = z.infer<typeof savedProposalSchema>;

export const prefsSchema = z.object({
  /** Manual strategy overrides keyed by roster id. */
  strategyOverrides: z.record(z.string(), strategySchema).default({}),
  untouchables: z.array(z.string()).default([]),
  tradeBlock: z.array(z.string()).default([]),
  targets: z.array(z.string()).default([]),
  savedProposals: z.array(savedProposalSchema).default([]),
});
export type Prefs = z.infer<typeof prefsSchema>;

/**
 * Preferences belong to a team in a league (co-owners share them; another manager in the same
 * league has their own). Spectators without a team get a separate "guest" bucket.
 */
export type PrefsOwner = { leagueId: string; rosterId: number | null };
const key = (o: PrefsOwner) => `prefs-${o.leagueId}-${o.rosterId != null ? `r${o.rosterId}` : "guest"}`;
/** Older, league-wide keys: carried over once, only for the owner's team (SLEEPER_LEAGUE_ID + MY_ROSTER_ID). */
const legacyKeys = (leagueId: string) => [`prefs-${leagueId}`, "user-prefs"];

function isOwnerTeam(o: PrefsOwner): boolean {
  const c = getConfig();
  return o.rosterId != null && o.leagueId === c.leagueId && o.rosterId === c.myRosterId;
}

export async function readPrefs(o: PrefsOwner): Promise<Prefs> {
  const store = getConfig().storage.data;
  try {
    let entry = await store.read<unknown>(key(o));
    if (!entry && isOwnerTeam(o)) {
      for (const k of legacyKeys(o.leagueId)) {
        entry = await store.read<unknown>(k);
        if (entry) break;
      }
    }
    const parsed = prefsSchema.safeParse(entry?.data);
    if (parsed.success) return parsed.data;
  } catch {
    // Missing or unreadable: fall through to defaults.
  }
  return prefsSchema.parse({});
}

export async function writePrefs(o: PrefsOwner, prefs: Prefs): Promise<Prefs> {
  const valid = prefsSchema.parse(prefs);
  await getConfig().storage.data.write(key(o), { key: key(o), fetchedAt: new Date().toISOString(), data: valid });
  return valid;
}

export async function updatePrefs(o: PrefsOwner, mutate: (p: Prefs) => Prefs): Promise<Prefs> {
  return writePrefs(o, mutate(await readPrefs(o)));
}
