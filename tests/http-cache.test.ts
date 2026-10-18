import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DataCache } from "@/lib/cache/file-cache";
import { FileStore } from "@/lib/store";
import { parsePickName } from "@/lib/providers/fantasycalc";
import { createSleeperClient } from "@/lib/sleeper/client";
import { ApiError, fetchJson } from "@/lib/sleeper/http";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchJson", () => {
  it("retries 5xx and then validates", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ a: 1 }));
    await expect(fetchJson("https://x", z.object({ a: z.number() }), { fetchImpl: f, retries: 1 })).resolves.toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry 404 and reports schema problems clearly", async () => {
    const f = vi.fn().mockResolvedValue(json({}, 404));
    await expect(fetchJson("https://x", z.object({}), { fetchImpl: f })).rejects.toMatchObject({ status: 404, kind: "http" });
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn().mockResolvedValue(json({ a: "nope" }));
    await expect(fetchJson("https://x", z.object({ a: z.number() }), { fetchImpl: g })).rejects.toMatchObject({ kind: "schema" });
  });

  it("treats a null league as not found", async () => {
    const client = createSleeperClient({ fetchImpl: vi.fn().mockResolvedValue(json(null)) });
    await expect(client.league("123")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("FileCache", () => {
  const dir = () => mkdtempSync(path.join(os.tmpdir(), "dd-cache-"));

  it("serves fresh entries from cache and refetches when forced", async () => {
    const cache = new DataCache(new FileStore(dir()));
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect((await cache.getOrFetch("k", fetcher, { ttlMs: 60_000 })).source).toBe("network");
    expect((await cache.getOrFetch("k", fetcher, { ttlMs: 60_000 })).data).toBe(1);
    expect((await cache.getOrFetch("k", fetcher, { ttlMs: 60_000, force: true })).data).toBe(2);
  });

  it("falls back to stale data when a refresh fails, and throws with no cache", async () => {
    const cache = new DataCache(new FileStore(dir()));
    await cache.getOrFetch("k", async () => "old", { ttlMs: 60_000 });
    const r = await cache.getOrFetch("k", async () => { throw new Error("down"); }, { ttlMs: 0 });
    expect(r).toMatchObject({ data: "old", stale: true, source: "stale-cache", error: "down" });
    await expect(cache.getOrFetch("other", async () => { throw new Error("down"); }, { ttlMs: 0 })).rejects.toThrow("down");
  });
});

describe("parsePickName", () => {
  it("parses generic and bucketed pick names", () => {
    expect(parsePickName("2027 1st")).toEqual({ season: "2027", round: 1, bucket: null });
    expect(parsePickName("2028 2nd (Late)")).toEqual({ season: "2028", round: 2, bucket: "late" });
    expect(parsePickName("Josh Allen")).toBeNull();
  });
});
