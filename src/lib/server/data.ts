import { redirect } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { NoLeagueSelectedError } from "@/lib/league/load-snapshot";

/**
 * Request-time access to the league model for Server Components. `connection()` excludes the
 * caller from prerendering, so live league data is never baked into a static shell. When no
 * league has been chosen yet, the visitor is sent to /setup. Wrapped in React `cache()` so the
 * layout's chips and the page share one load per request (selection and preferences are read once).
 */
export const getLeague = cache(async function getLeague() {
  await connection();
  try {
    return await loadLeagueModel();
  } catch (err) {
    if (err instanceof NoLeagueSelectedError) redirect("/setup");
    throw err;
  }
});

export function myTeam(model: Awaited<ReturnType<typeof getLeague>>["model"]) {
  return model.teams.find((t) => t.team.rosterId === model.myRosterId) ?? null;
}
