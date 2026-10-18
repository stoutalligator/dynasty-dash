import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/log";

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

type Entry<T> = { key: string; fetchedAt: string; data: T };

export type GetOrFetchOptions = {
  ttlMs: number;
  /** Bypass the TTL and fetch from the origin (falls back to cache on failure). */
  force?: boolean;
};

/**
 * Minimal JSON-on-disk cache with an in-memory layer and in-flight request de-duplication.
 * Fetchers must validate their data before returning, so invalid data is never cached.
 */
export class FileCache {
  private memory = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<Cached<unknown>>>();

  constructor(private readonly dir: string) {}

  private file(key: string) {
    return path.join(this.dir, `${key.replace(/[^a-z0-9._-]/gi, "_")}.json`);
  }

  async read<T>(key: string): Promise<Entry<T> | undefined> {
    const mem = this.memory.get(key) as Entry<T> | undefined;
    try {
      const stat = await fs.stat(this.file(key));
      // Another process (e.g. the CLI audit script) may have written a newer copy.
      if (mem && new Date(mem.fetchedAt).getTime() >= stat.mtimeMs - 1000) return mem;
      const entry = JSON.parse(await fs.readFile(this.file(key), "utf8")) as Entry<T>;
      this.memory.set(key, entry);
      return entry;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return mem;
      log.warn("unreadable cache entry; ignoring", { key, error: String(err) });
      return mem;
    }
  }

  async write<T>(key: string, data: T): Promise<Entry<T>> {
    const entry: Entry<T> = { key, fetchedAt: new Date().toISOString(), data };
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(key);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry));
    await fs.rename(tmp, target);
    this.memory.set(key, entry);
    return entry;
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, opts: GetOrFetchOptions): Promise<Cached<T>> {
    const pending = this.inflight.get(key);
    if (pending && !opts.force) return pending as Promise<Cached<T>>;
    const p = this.resolve(key, fetcher, opts).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async resolve<T>(key: string, fetcher: () => Promise<T>, opts: GetOrFetchOptions): Promise<Cached<T>> {
    const existing = await this.read<T>(key);
    if (existing && !opts.force) {
      const age = Date.now() - new Date(existing.fetchedAt).getTime();
      if (age < opts.ttlMs) return { data: existing.data, fetchedAt: existing.fetchedAt, source: "cache", stale: false };
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

const shared = new Map<string, FileCache>();
export function getCache(dir: string): FileCache {
  let cache = shared.get(dir);
  if (!cache) shared.set(dir, (cache = new FileCache(dir)));
  return cache;
}
