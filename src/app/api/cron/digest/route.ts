import { connection } from "next/server";
import { isAuthorizedCron } from "@/lib/auth";
import { resolveActiveLeague } from "@/lib/league/active";
import { runDigest } from "@/lib/digest/run";

export const maxDuration = 300;

/** Weekly digest (Vercel Cron): build, store and deliver to the configured webhook / ntfy topic. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCron(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await resolveActiveLeague())) return Response.json({ ok: true, skipped: "No league selected yet (visit /setup)." });
  const { digest, delivery } = await runDigest({ deliver: true });
  return Response.json({ ok: true, week: digest.week, headline: digest.headline, delivery });
}
