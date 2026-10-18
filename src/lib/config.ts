import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  SLEEPER_LEAGUE_ID: z
    .string()
    .regex(/^\d+$/, "SLEEPER_LEAGUE_ID must be a numeric Sleeper league id"),
  MY_ROSTER_ID: z.coerce.number().int().positive().optional(),
  EXPECTED_TEAM_NAME: z.string().optional(),
  VALUATION_PROVIDER: z.enum(["fantasycalc", "none"]).default("fantasycalc"),
  FUTURE_PICK_SEASONS: z.coerce.number().int().min(1).max(5).default(3),
  CACHE_DIR: z.string().default(".cache"),
});

export type AppConfig = {
  leagueId: string;
  myRosterId: number | undefined;
  expectedTeamName: string | undefined;
  valuationProvider: "fantasycalc" | "none";
  futurePickSeasons: number;
  cacheDir: string;
};

let cached: AppConfig | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration (${issues}). Copy .env.example to .env and fill it in.`);
  }
  const e = parsed.data;
  const config: AppConfig = {
    leagueId: e.SLEEPER_LEAGUE_ID,
    myRosterId: e.MY_ROSTER_ID,
    expectedTeamName: e.EXPECTED_TEAM_NAME || undefined,
    valuationProvider: e.VALUATION_PROVIDER,
    futurePickSeasons: e.FUTURE_PICK_SEASONS,
    // Runtime-only location; excluded from build tracing.
    cacheDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.CACHE_DIR),
  };
  if (env === process.env) cached = config;
  return config;
}
