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

const KEY = "user-prefs";

/** User preferences, persisted in the configured data store (local file, Neon Postgres or Upstash). */
export async function readPrefs(): Promise<Prefs> {
  try {
    const entry = await getConfig().storage.data.read<unknown>(KEY);
    const parsed = prefsSchema.safeParse(entry?.data);
    if (parsed.success) return parsed.data;
  } catch {
    // Missing or unreadable: fall through to defaults.
  }
  return prefsSchema.parse({});
}

export async function writePrefs(prefs: Prefs): Promise<Prefs> {
  const valid = prefsSchema.parse(prefs);
  await getConfig().storage.data.write(KEY, { key: KEY, fetchedAt: new Date().toISOString(), data: valid });
  return valid;
}

export async function updatePrefs(mutate: (p: Prefs) => Prefs): Promise<Prefs> {
  return writePrefs(mutate(await readPrefs()));
}
