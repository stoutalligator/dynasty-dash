import { after } from "next/server";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";
import type { KvStore, StoredEntry } from "@/lib/store";

const log = logger("cache");

export type CacheSource = "network" | "cache" | "stale-cache";

export type Cached<T> = {
  data: T;
  /** ISO timestamp of the last successful fetch from the origin. */
  fetchedAt: string;
  source: CacheSource;
  /** True when the TTL elapsed and a refresh failed, so older data is served. */
  stale: boolean;
  /** Present when a refresh failed. */
  error?: string;
};

export type GetOrFetchOptions = {
  ttlMs: number;
  /** Bypass the TTL and fetch from the origin (falls back to cache on failure). */
  force?: boolean;
  /**
   * Stale-while-revalidate window: within `ttlMs + staleWhileRevalidateMs`, an expired copy is
   * served immediately and refreshed in the background. Use for large, slow-changing sources so a
   * visitor never waits on them; leave unset for data that must be current (rosters, matchups).
   */
  staleWhileRevalidateMs?: number;
};

const age = (e: { fetchedAt: string }) => Date.now() - new Date(e.fetchedAt).getTime();

/**
 * Read-through cache over a KV store (local files or Upstash Redis), with an in-memory layer
 * and in-flight request de-duplication. Fetchers must validate their data before returning, so
 * invalid data is never cached.
 */
export class DataCache {
  private memory = new Map<string, StoredEntry<unknown>>();
  private inflight = new Map<string, Promise<Cached<unknown>>>();

  constructor(private readonly store: KvStore) {}

  async read<T>(key: string, ttlMs = Infinity): Promise<StoredEntry<T> | undefined> {
    const mem = this.memory.get(key) as StoredEntry<T> | undefined;
    // Fresh in-memory copies skip the store round trip; otherwise another process may have refreshed it.
    if (mem && age(mem) < ttlMs) return mem;
    try {
      const stored = await this.store.read<T>(key);
      if (stored && (!mem || stored.fetchedAt >= mem.fetchedAt)) {
        this.memory.set(key, stored);
        return stored;
      }
    } catch (err) {
      log.warn("cache store read failed", { key, error: String(err) });
    }
    return mem;
  }

  async write<T>(key: string, data: T): Promise<StoredEntry<T>> {
    const entry: StoredEntry<T> = { key, fetchedAt: new Date().toISOString(), data };
    this.memory.set(key, entry);
    try {
      await this.store.write(key, entry);
    } catch (err) {
      // The fetched data is still served from memory; persistence will be retried on the next fetch.
      log.warn("cache store write failed", { key, error: String(err) });
    }
    return entry;
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, opts: GetOrFetchOptions): Promise<Cached<T>> {
    const pending = this.inflight.get(key);
    if (pending && !opts.force) return pending as Promise<Cached<T>>;
    const p = this.resolve(key, fetcher, opts).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private revalidating = new Set<string>();

  /** Refresh a key in the background; the response is not held up (Next's `after` keeps serverless functions alive). */
  private revalidate<T>(key: string, fetcher: () => Promise<T>) {
    if (this.revalidating.has(key) || this.inflight.has(key)) return;
    this.revalidating.add(key);
    const p = fetcher()
      .then((data) => this.write(key, data))
      .then(() => log.info("revalidated", { key }))
      .catch((err) => log.warn("background refresh failed; keeping cached copy", { key, error: String(err) }))
      .finally(() => this.revalidating.delete(key));
    try {
      after(p);
    } catch {
      // Outside a request (scripts, tests): the promise simply runs to completion.
    }
  }

  private async resolve<T>(key: string, fetcher: () => Promise<T>, opts: GetOrFetchOptions): Promise<Cached<T>> {
    const existing = await this.read<T>(key, opts.force ? 0 : opts.ttlMs);
    if (existing && !opts.force && age(existing) < opts.ttlMs) {
      return { data: existing.data, fetchedAt: existing.fetchedAt, source: "cache", stale: false };
    }
    if (existing && !opts.force && opts.staleWhileRevalidateMs && age(existing) < opts.ttlMs + opts.staleWhileRevalidateMs) {
      this.revalidate(key, fetcher);
      return { data: existing.data, fetchedAt: existing.fetchedAt, source: "cache", stale: false };
    }
    try {
      const data = await fetcher();
      const entry = await this.write(key, data);
      log.info("fetched", { key });
      return { data, fetchedAt: entry.fetchedAt, source: "network", stale: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (existing) {
        log.warn("refresh failed; serving stale cache", { key, error: message });
        return { data: existing.data, fetchedAt: existing.fetchedAt, source: "stale-cache", stale: true, error: message };
      }
      throw err;
    }
  }
}

let shared: DataCache | undefined;

/** Process-wide cache over the configured storage backend. */
export function getCache(): DataCache {
  if (!shared) shared = new DataCache(getConfig().storage.cache);
  return shared;
}
