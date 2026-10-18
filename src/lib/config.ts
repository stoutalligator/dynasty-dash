import path from "node:path";
import { z } from "zod";
import { createStores, type Stores } from "@/lib/store";

const envSchema = z.object({
  /** Optional default league; normally chosen in the app at /setup. */
  SLEEPER_LEAGUE_ID: z
    .string()
    .regex(/^\d+$/, "SLEEPER_LEAGUE_ID must be a numeric Sleeper league id")
    .optional(),
  MY_ROSTER_ID: z.coerce.number().int().positive().optional(),
  EXPECTED_TEAM_NAME: z.string().optional(),
  VALUATION_PROVIDER: z.enum(["fantasycalc", "none"]).default("fantasycalc"),
  FUTURE_PICK_SEASONS: z.coerce.number().int().min(1).max(5).default(3),
  CACHE_DIR: z.string().default(".cache"),
  DATA_DIR: z.string().default("data"),
  STORAGE: z.enum(["auto", "file", "postgres", "upstash"]).default("auto"),
  // Neon's Vercel integration sets DATABASE_URL (and POSTGRES_URL).
  DATABASE_URL: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  // Vercel's Upstash integration exposes KV_REST_API_*; direct Upstash setups use UPSTASH_REDIS_REST_*.
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters").optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  DIGEST_WEBHOOK_URL: z.string().url().optional(),
  NTFY_TOPIC: z.string().regex(/^[\w-]{6,64}$/).optional(),
  APP_URL: z.string().url().optional(),
  SIM_RUNS: z.coerce.number().int().min(500).max(50_000).default(10_000),
});

export type AppConfig = {
  /** Fallback league when none has been chosen in the app. */
  leagueId: string | undefined;
  myRosterId: number | undefined;
  expectedTeamName: string | undefined;
  valuationProvider: "fantasycalc" | "none";
  futurePickSeasons: number;
  cacheDir: string;
  dataDir: string;
  storage: Stores;
  appPassword: string | undefined;
  cronSecret: string | undefined;
  digestWebhookUrl: string | undefined;
  ntfyTopic: string | undefined;
  appUrl: string | undefined;
  simRuns: number;
};

let cached: AppConfig | undefined;

const blankToUndefined = (env: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === "" ? undefined : v]));

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(blankToUndefined(env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration (${issues}). Copy .env.example to .env and fill it in.`);
  }
  const e = parsed.data;
  // Runtime-only locations; excluded from build tracing.
  const cacheDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.CACHE_DIR);
  const dataDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.DATA_DIR);
  const config: AppConfig = {
    leagueId: e.SLEEPER_LEAGUE_ID,
    myRosterId: e.MY_ROSTER_ID,
    expectedTeamName: e.EXPECTED_TEAM_NAME || undefined,
    valuationProvider: e.VALUATION_PROVIDER,
    futurePickSeasons: e.FUTURE_PICK_SEASONS,
    cacheDir,
    dataDir,
    storage: createStores({
      mode: e.STORAGE,
      databaseUrl: e.DATABASE_URL ?? e.POSTGRES_URL,
      upstashUrl: e.KV_REST_API_URL ?? e.UPSTASH_REDIS_REST_URL,
      upstashToken: e.KV_REST_API_TOKEN ?? e.UPSTASH_REDIS_REST_TOKEN,
      cacheDir,
      dataDir,
      // League-specific keys include the league id, so one namespace serves every league.
      namespace: "dynasty",
      onVercel: !!env.VERCEL,
    }),
    appPassword: e.APP_PASSWORD,
    cronSecret: e.CRON_SECRET,
    digestWebhookUrl: e.DIGEST_WEBHOOK_URL,
    ntfyTopic: e.NTFY_TOPIC,
    appUrl: e.APP_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
    simRuns: e.SIM_RUNS,
  };
  if (env === process.env) cached = config;
  return config;
}
