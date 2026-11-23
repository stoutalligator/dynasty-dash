import { after } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { logger } from "@/lib/log";
import { resolveActiveLeague } from "@/lib/league/active";
import { setImmediate as yieldToRequests } from "node:timers/promises";
import { defaultTrades, myRecommendations } from "./insights";

const log = logger("warm");
const EVERY_MS = 5 * 60_000;
let lastStarted = 0;
let running: Promise<void> | null = null;

/**
 * Build the league model and the Dashboard's trade ideas in the background (e.g. while someone is
 * typing the site password), so the first page after sign-in is served from memory. Nothing is
 * returned or exposed; it only fills this server instance's caches. Throttled to once per 5 min.
 */
export function warmInBackground() {
  if (running || Date.now() - lastStarted < EVERY_MS) return;
  lastStarted = Date.now();
  running = (async () => {
    const t0 = Date.now();
    try {
      if (!(await resolveActiveLeague())) return;
      const { model, prefs } = await loadLeagueModel();
      // One objective at a time, yielding in between, so a sign-in arriving meanwhile isn't blocked.
      if (model.myRosterId != null) {
        for (const objective of ["contender", "retool", "rebuild"] as const) {
          await yieldToRequests();
          defaultTrades(model, prefs, objective);
        }
        await yieldToRequests();
        myRecommendations(model, prefs); // now served from the memo above
      }
      log.info("warmed", { ms: Date.now() - t0 });
    } catch (err) {
      log.warn("warm-up failed", { error: String(err) });
    } finally {
      running = null;
    }
  })();
  try {
    after(running);
  } catch {
    // Outside a request: the promise still runs.
  }
}
