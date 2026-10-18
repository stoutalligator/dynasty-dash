/** Sleeper starting-slot eligibility. Slots not listed here (e.g. IDP) are left unfilled. */
export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

/** Gradable positions eligible for at least one of the league's starting slots, in display order. */
export function gradedPositions(startingSlots: string[]): string[] {
  const eligible = new Set(startingSlots.flatMap((s) => SLOT_ELIGIBILITY[s] ?? []));
  return ["QB", "RB", "WR", "TE", "K", "DEF"].filter((p) => eligible.has(p));
}

export type LineupCandidate = { id: string; positions: string[]; score: number };
export type LineupAssignment = { slot: string; playerId: string | null; score: number };
export type Lineup = { assignments: LineupAssignment[]; total: number };

/**
 * Best possible lineup by score. Slots are filled most-restrictive first with the best eligible
 * remaining player, which is optimal when eligibility sets are nested (QB ⊂ SUPER_FLEX,
 * RB/WR/TE ⊂ FLEX ⊂ SUPER_FLEX), as in standard Sleeper formats.
 */
export function optimalLineup(candidates: LineupCandidate[], slots: string[]): Lineup {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  const order = slots
    .map((slot, i) => ({ slot, i, size: SLOT_ELIGIBILITY[slot]?.length ?? 99 }))
    .sort((a, b) => a.size - b.size || a.i - b.i);
  const assignments: LineupAssignment[] = new Array(slots.length);
  let total = 0;
  for (const { slot, i } of order) {
    const eligible = SLOT_ELIGIBILITY[slot] ?? [];
    const pick = pool.find((c) => !used.has(c.id) && c.positions.some((p) => eligible.includes(p)));
    if (pick) {
      used.add(pick.id);
      total += pick.score;
    }
    assignments[i] = { slot, playerId: pick?.id ?? null, score: pick?.score ?? 0 };
  }
  return { assignments, total: Math.round(total * 100) / 100 };
}

/** Lineup points lost if each player were removed: a direct "how much do we need them" measure. */
export function lineupImpacts(candidates: LineupCandidate[], slots: string[]): Map<string, number> {
  const base = optimalLineup(candidates, slots);
  const starters = new Set(base.assignments.map((a) => a.playerId).filter(Boolean) as string[]);
  const impacts = new Map<string, number>();
  for (const c of candidates) {
    if (!starters.has(c.id)) {
      impacts.set(c.id, 0);
      continue;
    }
    const without = optimalLineup(candidates.filter((x) => x.id !== c.id), slots);
    impacts.set(c.id, Math.round((base.total - without.total) * 100) / 100);
  }
  return impacts;
}
