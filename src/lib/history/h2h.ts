import type { WeekResult } from "@/lib/league/models";

export type H2HRecord = { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; thisSeason: { wins: number; losses: number; ties: number } };

/**
 * All-time head-to-head records between current teams, matched across seasons by Sleeper owner
 * (so a team keeps its history through renames). Completed games only, playoffs included.
 */
export function headToHead(opts: {
  pastSeasons: { weeks: WeekResult[]; rosterOwner: Record<number, string | null> }[];
  currentWeeks: WeekResult[];
  currentTeams: { rosterId: number; ownerId: string | null }[];
}): Record<number, Record<number, H2HRecord>> {
  const rosterByOwner = new Map(opts.currentTeams.filter((t) => t.ownerId).map((t) => [t.ownerId!, t.rosterId]));
  const out: Record<number, Record<number, H2HRecord>> = {};
  const rec = (a: number, b: number) => {
    out[a] ??= {};
    return (out[a][b] ??= { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, thisSeason: { wins: 0, losses: 0, ties: 0 } });
  };
  const addWeeks = (weeks: WeekResult[], toCurrent: (rosterId: number) => number | undefined, current: boolean) => {
    for (const w of weeks) {
      if (!w.complete) continue;
      const byMatch = new Map<number, { rosterId: number; points: number }[]>();
      for (const e of w.entries) {
        if (e.matchupId == null) continue;
        byMatch.set(e.matchupId, [...(byMatch.get(e.matchupId) ?? []), { rosterId: e.rosterId, points: e.points }]);
      }
      for (const pair of byMatch.values()) {
        if (pair.length !== 2) continue;
        const [x, y] = pair;
        const a = toCurrent(x.rosterId), b = toCurrent(y.rosterId);
        if (a == null || b == null || a === b) continue;
        for (const [me, them, mine, theirs] of [[a, b, x.points, y.points], [b, a, y.points, x.points]] as const) {
          const r = rec(me, them);
          r.pointsFor += mine;
          r.pointsAgainst += theirs;
          const k = mine > theirs ? "wins" : mine < theirs ? "losses" : "ties";
          r[k]++;
          if (current) r.thisSeason[k]++;
        }
      }
    }
  };
  for (const s of opts.pastSeasons) {
    addWeeks(s.weeks, (rid) => {
      const owner = s.rosterOwner[rid];
      return owner ? rosterByOwner.get(owner) : undefined;
    }, false);
  }
  const currentIds = new Set(opts.currentTeams.map((t) => t.rosterId));
  addWeeks(opts.currentWeeks, (rid) => (currentIds.has(rid) ? rid : undefined), true);
  for (const a of Object.values(out)) for (const r of Object.values(a)) { r.pointsFor = Math.round(r.pointsFor * 10) / 10; r.pointsAgainst = Math.round(r.pointsAgainst * 10) / 10; }
  return out;
}
