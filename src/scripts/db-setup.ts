/**
 * Verify the configured storage and create the Postgres table if needed:
 *   npm run db:setup            (uses DATABASE_URL from .env / the environment)
 */
import { getConfig } from "@/lib/config";
import { PostgresStore } from "@/lib/store";

async function main() {
  const { storage } = getConfig();
  console.log(`Storage backend: ${storage.data.kind}${storage.warning ? ` (warning: ${storage.warning})` : ""}`);
  if (storage.data instanceof PostgresStore) {
    await storage.data.ensureSchema();
    console.log("Table dynasty_kv is ready.");
  }
  const key = "setup-check";
  const now = new Date().toISOString();
  await storage.data.write(key, { key, fetchedAt: now, data: { ok: true } });
  const back = await storage.data.read<{ ok: boolean }>(key);
  if (!back?.data.ok) throw new Error("Wrote a test entry but could not read it back.");
  console.log("Read/write check passed.");
}

main().catch((err) => {
  console.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
