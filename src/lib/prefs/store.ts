import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

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

/** User preferences persisted as local JSON (gitignored). Swap for a database when multi-user. */
const file = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data", "user-prefs.json");

export async function readPrefs(): Promise<Prefs> {
  try {
    const parsed = prefsSchema.safeParse(JSON.parse(await fs.readFile(file(), "utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // Missing or unreadable file: fall through to defaults.
  }
  return prefsSchema.parse({});
}

export async function writePrefs(prefs: Prefs): Promise<Prefs> {
  const valid = prefsSchema.parse(prefs);
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(valid, null, 2));
  return valid;
}

export async function updatePrefs(mutate: (p: Prefs) => Prefs): Promise<Prefs> {
  return writePrefs(mutate(await readPrefs()));
}
