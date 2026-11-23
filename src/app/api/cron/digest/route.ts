import { connection } from "next/server";
import { isAuthorizedCron } from "@/lib/auth";
import { defaultLeague } from "@/lib/league/active";
import { runDigest } from "@/lib/digest/run";

export const maxDuration = 300;

/** Weekly digest (Vercel Cron): build, store and deliver to the configured webhook / ntfy topic. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCron(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const active = defaultLeague();
  if (!active) return Response.json({ ok: true, skipped: "Set SLEEPER_LEAGUE_ID (and MY_ROSTER_ID) for scheduled jobs." });
  const { digest, delivery } = await runDigest({ deliver: true, active });
  return Response.json({ ok: true, week: digest.week, headline: digest.headline, delivery });
}
