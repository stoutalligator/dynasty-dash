import { connection } from "next/server";
import { loadLeagueModel } from "@/lib/analysis/load-model";

/**
 * Request-time access to the league model for Server Components. `connection()` excludes the
 * caller from prerendering, so live league data is never baked into a static shell.
 */
export async function getLeague() {
  await connection();
  return loadLeagueModel();
}

export function myTeam(model: Awaited<ReturnType<typeof getLeague>>["model"]) {
  return model.teams.find((t) => t.team.rosterId === model.myRosterId) ?? null;
}
