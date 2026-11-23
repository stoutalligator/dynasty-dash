import { connection } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { isAuthorizedCron } from "@/lib/auth";
import { defaultLeague } from "@/lib/league/active";
import { defaultTrades } from "@/lib/server/insights";
import { recordSnapshot } from "@/lib/snapshots/store";

// Refreshing the player database, stats, projections and history can take a while on a cold cache.
export const maxDuration = 300;

/** Daily warm-up (Vercel Cron): refresh every source so page loads stay fast. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCron(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const active = defaultLeague();
  if (!active) return Response.json({ ok: true, skipped: "Optional: set SLEEPER_LEAGUE_ID to pre-warm a league daily." });
  const t0 = Date.now();
  const { model, prefs } = await loadLeagueModel({ refresh: "all", active });
  // Pre-build the trade ideas the Dashboard, My Team and Trade Hub ask for (same keys as the pages).
  if (model.myRosterId != null) for (const objective of ["contender", "retool", "rebuild"] as const) defaultTrades(model, prefs, objective);
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  if (me) defaultTrades(model, prefs, me.strategy.effective, 30);
  await recordSnapshot(model);
  return Response.json({
    ok: true,
    ms: Date.now() - t0,
    week: model.league.currentWeek,
    issues: model.issues.filter((i) => i.level !== "info").map((i) => i.message),
  });
}
