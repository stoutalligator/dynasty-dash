/**
 * League audit: fetch the configured Sleeper league, map every rostered player id to a readable
 * player record, resolve draft-pick ownership, and write data/league-audit.json.
 *
 *   npm run league-audit                     # uses caches within their TTL
 *   npm run league-audit -- --refresh       # refresh league data (not the player DB)
 *   npm run league-audit -- --refresh-all   # also re-download the player DB
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAudit } from "@/lib/league/audit";
import { loadLeagueSnapshot, type RefreshScope } from "@/lib/league/load-snapshot";

async function main() {
  const args = new Set(process.argv.slice(2));
  const refresh: RefreshScope = args.has("--refresh-all") ? "all" : args.has("--refresh") ? "league" : "none";
  const snapshot = await loadLeagueSnapshot({ refresh });
  const audit = buildAudit(snapshot);

  const out = path.resolve("data", "league-audit.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(audit, null, 2));

  const me = snapshot.teams.find((t) => t.isMine);
  console.log(`\n${audit.league.name} — ${audit.league.season} (${audit.league.format.scoringLabel}${audit.league.format.superflex ? ", Superflex" : ""})`);
  console.log(`Teams: ${audit.managers.length} | Players mapped: ${audit.playerMapping.mapped}/${audit.playerMapping.rosteredPlayers}`);
  console.log(`My team: ${me ? `${me.teamName} (roster ${me.rosterId}, ${me.wins}-${me.losses})` : "NOT VERIFIED"}`);
  for (const note of snapshot.verification.notes) console.log(`  note: ${note}`);
  const counts = snapshot.issues.reduce<Record<string, number>>((a, i) => ((a[i.level] = (a[i.level] ?? 0) + 1), a), {});
  console.log(`Issues: ${JSON.stringify(counts)}`);
  for (const i of snapshot.issues.filter((i) => i.level !== "info")) console.log(`  [${i.level}] ${i.message}`);
  console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
