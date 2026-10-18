import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";
import { logger } from "@/lib/log";

const log = logger("store");

export type StoredEntry<T> = { key: string; fetchedAt: string; data: T };

/** Minimal key/value persistence used by the data cache, preferences and the digest. */
export interface KvStore {
  readonly kind: "file" | "upstash" | "postgres";
  read<T>(key: string): Promise<StoredEntry<T> | undefined>;
  write<T>(key: string, entry: StoredEntry<T>): Promise<void>;
}

/** JSON files on local disk (development, self-hosting). */
export class FileStore implements KvStore {
  readonly kind = "file" as const;
  constructor(private readonly dir: string) {}

  private file(key: string) {
    return path.join(this.dir, `${key.replace(/[^a-z0-9._-]/gi, "_")}.json`);
  }

  async read<T>(key: string): Promise<StoredEntry<T> | undefined> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file(key), "utf8"));
      // Accept legacy files that stored the bare value without the entry wrapper.
      if (parsed && typeof parsed === "object" && "fetchedAt" in parsed && "data" in parsed) return parsed as StoredEntry<T>;
      return { key, fetchedAt: new Date(0).toISOString(), data: parsed as T };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") log.warn("unreadable entry; ignoring", { key, error: String(err) });
      return undefined;
    }
  }

  async write<T>(key: string, entry: StoredEntry<T>): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry));
    await fs.rename(tmp, target);
  }
}

/**
 * Upstash Redis over its REST API (what Vercel's Upstash/KV integration provisions). Values are
 * gzip-compressed JSON (the player database is ~3.4 MB raw, ~0.4 MB compressed).
 */
export class UpstashStore implements KvStore {
  readonly kind = "upstash" as const;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly prefix: string,
    private readonly ttlSeconds?: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async command(cmd: (string | number)[]): Promise<unknown> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Upstash ${cmd[0]} failed: ${body.error ?? `HTTP ${res.status}`}`);
    return body.result;
  }

  async read<T>(key: string): Promise<StoredEntry<T> | undefined> {
    const raw = await this.command(["GET", this.prefix + key]);
    if (typeof raw !== "string") return undefined;
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as StoredEntry<T>;
  }

  async write<T>(key: string, entry: StoredEntry<T>): Promise<void> {
    const value = gzipSync(JSON.stringify(entry)).toString("base64");
    await this.command(this.ttlSeconds ? ["SET", this.prefix + key, value, "EX", this.ttlSeconds] : ["SET", this.prefix + key, value]);
  }
}

/**
 * Postgres (Neon) over its serverless HTTP driver: one small key/value table, values stored as
 * gzip-compressed JSON. The table is created on first use (or via `npm run db:setup`).
 */
export class PostgresStore implements KvStore {
  readonly kind = "postgres" as const;
  private readonly sql: ReturnType<typeof neon>;
  private ready: Promise<void> | undefined;

  constructor(
    databaseUrl: string,
    private readonly namespace: string,
    private readonly ttlSeconds?: number,
  ) {
    this.sql = neon(databaseUrl);
  }

  /** Idempotent schema setup. */
  ensureSchema(): Promise<void> {
    this.ready ??= (async () => {
      await this.sql.query(
        `CREATE TABLE IF NOT EXISTS dynasty_kv (
           namespace text NOT NULL,
           key text NOT NULL,
           fetched_at timestamptz NOT NULL,
           expires_at timestamptz,
           value text NOT NULL,
           PRIMARY KEY (namespace, key)
         )`,
      );
    })().catch((err) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  async read<T>(key: string): Promise<StoredEntry<T> | undefined> {
    await this.ensureSchema();
    const rows = (await this.sql.query(
      "SELECT value FROM dynasty_kv WHERE namespace = $1 AND key = $2 AND (expires_at IS NULL OR expires_at > now())",
      [this.namespace, key],
    )) as { value: string }[];
    if (!rows.length) return undefined;
    return JSON.parse(gunzipSync(Buffer.from(rows[0].value, "base64")).toString("utf8")) as StoredEntry<T>;
  }

  async write<T>(key: string, entry: StoredEntry<T>): Promise<void> {
    await this.ensureSchema();
    const value = gzipSync(JSON.stringify(entry)).toString("base64");
    const expires = this.ttlSeconds ? new Date(Date.now() + this.ttlSeconds * 1000).toISOString() : null;
    await this.sql.query(
      `INSERT INTO dynasty_kv (namespace, key, fetched_at, expires_at, value) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (namespace, key) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at, value = EXCLUDED.value`,
      [this.namespace, key, entry.fetchedAt, expires, value],
    );
    // Occasionally purge expired cache rows so the table stays small.
    if (this.ttlSeconds && Math.random() < 0.02) {
      await this.sql.query("DELETE FROM dynasty_kv WHERE expires_at IS NOT NULL AND expires_at < now()").catch(() => undefined);
    }
  }
}

export type StorageConfig = {
  mode: "auto" | "file" | "postgres" | "upstash";
  databaseUrl?: string;
  upstashUrl?: string;
  upstashToken?: string;
  cacheDir: string;
  dataDir: string;
  namespace: string;
  onVercel: boolean;
};

export type Stores = { cache: KvStore; data: KvStore; warning: string | null };

/**
 * Pick storage: Postgres (Neon) when DATABASE_URL is set, else Upstash when configured, else local
 * files. On Vercel without either, fall back to /tmp so the app still works, and warn that
 * preferences will not persist across deployments or instances.
 */
export function createStores(c: StorageConfig): Stores {
  const hasUpstash = !!(c.upstashUrl && c.upstashToken);
  if (c.mode === "postgres" || (c.mode === "auto" && c.databaseUrl)) {
    if (!c.databaseUrl) throw new Error("STORAGE=postgres but DATABASE_URL is not set.");
    return {
      // Cache rows expire after 30 days so abandoned keys don't accumulate; user data never expires.
      cache: new PostgresStore(c.databaseUrl, `${c.namespace}:cache`, 30 * 86400),
      data: new PostgresStore(c.databaseUrl, `${c.namespace}:data`),
      warning: null,
    };
  }
  if (c.mode === "upstash" || (c.mode === "auto" && hasUpstash)) {
    if (!hasUpstash) throw new Error("STORAGE=upstash but KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) are not set.");
    return {
      // Cache entries expire after 30 days so abandoned keys don't accumulate; user data never expires.
      cache: new UpstashStore(c.upstashUrl!, c.upstashToken!, `${c.namespace}:cache:`, 30 * 86400),
      data: new UpstashStore(c.upstashUrl!, c.upstashToken!, `${c.namespace}:data:`),
      warning: null,
    };
  }
  if (c.onVercel) {
    return {
      cache: new FileStore("/tmp/dynasty-cache"),
      data: new FileStore("/tmp/dynasty-data"),
      warning: "No database configured: using temporary storage, so preferences, saved trades and digests will not persist. Connect a Neon database (DATABASE_URL) in Vercel.",
    };
  }
  return { cache: new FileStore(c.cacheDir), data: new FileStore(c.dataDir), warning: null };
}
