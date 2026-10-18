import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPassword, createSessionToken, isAuthorizedCron, safeEqual, verifySessionToken } from "@/lib/auth";
import { createStores, FileStore, PostgresStore, UpstashStore } from "@/lib/store";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "dd-store-"));
const base = { cacheDir: "/c", dataDir: "/d", namespace: "dynasty:1", onVercel: false };

describe("storage selection", () => {
  it("prefers Postgres when DATABASE_URL is set", () => {
    const s = createStores({ ...base, mode: "auto", databaseUrl: "postgres://u:p@host/db", upstashUrl: "https://x", upstashToken: "t" });
    expect(s.cache).toBeInstanceOf(PostgresStore);
    expect(s.data.kind).toBe("postgres");
    expect(s.warning).toBeNull();
  });

  it("uses Upstash when only Upstash is configured, files otherwise", () => {
    expect(createStores({ ...base, mode: "auto", upstashUrl: "https://x", upstashToken: "t" }).cache).toBeInstanceOf(UpstashStore);
    expect(createStores({ ...base, mode: "auto" }).cache).toBeInstanceOf(FileStore);
  });

  it("falls back to temporary storage on Vercel with a warning", () => {
    const s = createStores({ ...base, mode: "auto", onVercel: true });
    expect(s.cache.kind).toBe("file");
    expect(s.warning).toMatch(/not persist/);
  });

  it("refuses an explicit backend without credentials", () => {
    expect(() => createStores({ ...base, mode: "postgres" })).toThrow(/DATABASE_URL/);
  });
});

describe("FileStore", () => {
  it("round-trips entries and reads legacy bare-value files", async () => {
    const dir = tmp();
    const store = new FileStore(dir);
    await store.write("k", { key: "k", fetchedAt: "2026-01-01T00:00:00.000Z", data: { a: 1 } });
    expect((await store.read("k"))?.data).toEqual({ a: 1 });
    writeFileSync(path.join(dir, "legacy.json"), JSON.stringify({ untouchables: ["player:1"] }));
    expect((await store.read<{ untouchables: string[] }>("legacy"))?.data.untouchables).toEqual(["player:1"]);
    expect(await store.read("missing")).toBeUndefined();
  });
});

describe("UpstashStore", () => {
  it("stores gzip-compressed JSON via the REST API", async () => {
    const kv = new Map<string, string>();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const [cmd, key, value] = JSON.parse(String(init!.body)) as string[];
      if (cmd === "SET") kv.set(key, value);
      return new Response(JSON.stringify({ result: cmd === "GET" ? (kv.get(key) ?? null) : "OK" }));
    }) as unknown as typeof fetch;
    const store = new UpstashStore("https://kv.example", "token", "ns:", undefined, fetchImpl);
    const entry = { key: "players", fetchedAt: "2026-01-01T00:00:00.000Z", data: { big: "x".repeat(10_000) } };
    await store.write("players", entry);
    expect(kv.get("ns:players")!.length).toBeLessThan(1000); // compressed
    expect(await store.read("players")).toEqual(entry);
    expect(await store.read("nope")).toBeUndefined();
  });
});

describe("auth", () => {
  afterEach(() => {
    delete process.env.APP_PASSWORD;
    delete process.env.AUTH_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("is open when no password is configured", async () => {
    expect(await verifySessionToken(undefined)).toBe(true);
    expect(checkPassword("anything")).toBe(false);
  });

  it("signs, verifies and expires session tokens", async () => {
    process.env.APP_PASSWORD = "correct horse";
    const token = await createSessionToken(Date.now());
    expect(await verifySessionToken(token)).toBe(true);
    expect(await verifySessionToken(token.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
    expect(await verifySessionToken(await createSessionToken(Date.now() - 31 * 86400_000))).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    // Changing the password invalidates existing sessions.
    process.env.APP_PASSWORD = "new password";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("authorizes Vercel Cron only with the bearer secret", () => {
    expect(isAuthorizedCron("Bearer x")).toBe(false);
    process.env.CRON_SECRET = "s".repeat(32);
    expect(isAuthorizedCron(`Bearer ${"s".repeat(32)}`)).toBe(true);
    expect(isAuthorizedCron(null)).toBe(false);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});
