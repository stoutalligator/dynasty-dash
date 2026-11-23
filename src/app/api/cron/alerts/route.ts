import { connection } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { runAlerts } from "@/lib/alerts/run";
import { isAuthorizedCron } from "@/lib/auth";
import { defaultLeague } from "@/lib/league/active";

export const maxDuration = 300;

/**
 * Injury and trade-target alerts. Runs inside the daily refresh too; point an external scheduler
 * (e.g. hourly on game days) here with `Authorization: Bearer $CRON_SECRET` for faster alerts.
 */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCron(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const active = defaultLeague();
  if (!active) return Response.json({ ok: true, skipped: "Set SLEEPER_LEAGUE_ID (and MY_ROSTER_ID) for scheduled jobs." });
  const { model, prefs } = await loadLeagueModel({ refresh: "league", active });
  const { alerts, delivery } = await runAlerts(model, prefs);
  return Response.json({ ok: true, alerts: alerts.map((a) => a.text), delivery });
}
