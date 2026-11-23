import { getCache } from "@/lib/cache/file-cache";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import { fantasyCalcProvider } from "./fantasycalc";
import type { ProviderContext, ValuationProvider, ValuationSet } from "./types";

const log = logger("providers");

const PROVIDERS: Record<string, ValuationProvider> = {
  fantasycalc: fantasyCalcProvider,
};

export const VALUATION_TTL_MS = 6 * 3600_000;

export type ProviderStatus = {
  configured: string;
  active: string | null;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
};

/**
 * Load third-party valuations for the configured provider (cached 12h).
 * Returns null — never fabricated data — when no provider is configured or it is unavailable.
 */
export async function loadExternalValuations(
  ctx: ProviderContext,
  opts: { force?: boolean } = {},
): Promise<{ set: ValuationSet | null; status: ProviderStatus }> {
  const config = getConfig();
  const provider = PROVIDERS[config.valuationProvider];
  if (!provider) {
    return { set: null, status: { configured: config.valuationProvider, active: null, fetchedAt: null, stale: false, error: null } };
  }
  const key = `valuations-${provider.id}-${ctx.dynasty === false ? "redraft" : "dynasty"}-${ctx.superflex ? "sf" : "1qb"}-${ctx.teams}-${ctx.receptionPoints}`;
  try {
    // Market values move daily (more around the trade deadline and rookie drafts): refresh every
    // 6 hours, serve the last copy instantly while refreshing, and refetch on every manual Refresh.
    const cached = await getCache().getOrFetch(key, () => provider.fetch(ctx), {
      ttlMs: VALUATION_TTL_MS,
      force: opts.force,
      staleWhileRevalidateMs: 3 * 24 * 3600_000,
    });
    return {
      set: { ...cached.data, fetchedAt: cached.fetchedAt },
      status: { configured: provider.id, active: provider.id, fetchedAt: cached.fetchedAt, stale: cached.stale, error: cached.error ?? null },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn("valuation provider unavailable", { provider: provider.id, error });
    return { set: null, status: { configured: provider.id, active: null, fetchedAt: null, stale: false, error } };
  }
}
