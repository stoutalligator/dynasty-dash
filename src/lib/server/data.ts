import { redirect } from "next/navigation";
import { cache } from "react";
import { after, connection } from "next/server";
import { recordSnapshot } from "@/lib/snapshots/store";
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
    const result = await loadLeagueModel();
    // Keep a daily history (odds, value, power rank) without slowing the response.
    try {
      after(() => recordSnapshot(result.model));
    } catch {
      // Outside a request: skip.
    }
    return result;
  } catch (err) {
    if (err instanceof NoLeagueSelectedError) redirect("/setup");
    throw err;
  }
});

export function myTeam(model: Awaited<ReturnType<typeof getLeague>>["model"]) {
  return model.teams.find((t) => t.team.rosterId === model.myRosterId) ?? null;
}

/** Every player the app knows: rostered players and tracked free agents. */
export function findPlayer(model: Awaited<ReturnType<typeof getLeague>>["model"], id: string) {
  return model.teams.flatMap((t) => t.players).find((p) => p.id === id) ?? model.freeAgents.find((p) => p.id === id) ?? null;
}
