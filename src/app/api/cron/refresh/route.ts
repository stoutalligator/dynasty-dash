import { connection } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { isAuthorizedCron } from "@/lib/auth";
import { defaultTrades } from "@/lib/server/insights";

// Refreshing the player database, stats, projections and history can take a while on a cold cache.
export const maxDuration = 300;

/** Daily warm-up (Vercel Cron): refresh every source so page loads stay fast. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCron(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const { model, prefs } = await loadLeagueModel({ refresh: "all" });
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  if (me) defaultTrades(model, prefs, me.strategy.effective, 30);
  return Response.json({
    ok: true,
    ms: Date.now() - t0,
    week: model.league.currentWeek,
    issues: model.issues.filter((i) => i.level !== "info").map((i) => i.message),
  });
}
