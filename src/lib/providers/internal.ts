import type { PlayerProduction } from "@/lib/analysis/production";
import type { PlayerDb } from "@/lib/league/models";
import type { PickValuation, ValuationSet } from "./types";

/**
 * Internal fallback valuation used when no third-party provider is configured or reachable.
 * It is an approximation built only from this league's actual production plus a published,
 * position-specific age curve. It is clearly labelled as an estimate everywhere it is shown.
 */

/** Multiplier applied to production by age; a transparent heuristic, not a forecast. */
export function ageFactor(position: string | null, age: number | null): number {
  if (age == null) return 0.9;
  const curve: Record<string, { peakUntil: number; declinePerYear: number }> = {
    QB: { peakUntil: 31, declinePerYear: 0.07 },
    RB: { peakUntil: 25, declinePerYear: 0.14 },
    WR: { peakUntil: 27, declinePerYear: 0.09 },
    TE: { peakUntil: 28, declinePerYear: 0.09 },
  };
  const c = curve[position ?? ""] ?? { peakUntil: 27, declinePerYear: 0.1 };
  const youthBonus = age < 24 ? (24 - age) * 0.05 : 0;
  const decline = Math.max(0, age - c.peakUntil) * c.declinePerYear;
  return Math.max(0.15, Math.min(1.25, 1 + youthBonus - decline));
}

/**
 * Positional scarcity is already captured by measuring production above each position's league
 * replacement level (which is high for QBs in superflex). TE is slightly discounted: no TE premium.
 */
const POSITION_WEIGHT: Record<string, number> = { QB: 1.0, RB: 1.0, WR: 1.0, TE: 0.9 };

/** Generic pick values on the same 0–10,000 scale; future years are discounted 10%/yr. */
export function heuristicPickValues(seasons: string[], rounds: number, firstSeason: number): PickValuation[] {
  const base = [3000, 1100, 450, 200, 100];
  return seasons.flatMap((s) =>
    Array.from({ length: rounds }, (_, i) => ({
      season: s,
      round: i + 1,
      bucket: null,
      value: Math.round((base[i] ?? 50) * 0.9 ** Math.max(0, Number(s) - firstSeason)),
    })),
  );
}

export function buildInternalValuation(opts: {
  production: Map<string, PlayerProduction>;
  players: PlayerDb;
  rosteredIds: string[];
  replacementPpg: Record<string, number>;
  pickSeasons: string[];
  draftRounds: number;
  ctx: { superflex: boolean; receptionPoints: number; teams: number };
}): ValuationSet {
  const raw: Record<string, number> = {};
  for (const id of opts.rosteredIds) {
    const p = opts.players[id];
    const prod = opts.production.get(id);
    if (!p || !prod) continue;
    const pos = p.position ?? "";
    const surplus = Math.max(0, prod.adjPpg - (opts.replacementPpg[pos] ?? 0));
    const score = (surplus + 1) * ageFactor(pos, p.age) * (POSITION_WEIGHT[pos] ?? 0.5);
    raw[id] = score;
  }
  const max = Math.max(1, ...Object.values(raw));
  const players: ValuationSet["players"] = {};
  for (const [id, score] of Object.entries(raw)) {
    players[id] = { value: Math.round((score / max) * 10_000), redraftValue: null, overallRank: null, positionRank: null, trend30Day: null };
  }
  const first = Number(opts.pickSeasons[0] ?? new Date().getFullYear());
  return {
    providerId: "internal",
    label: "Internal estimate",
    kind: "internal-estimate",
    description:
      "Approximate value from this season's league production above replacement, times a position age curve. Not market data; rookies and injured players are undervalued.",
    fetchedAt: new Date().toISOString(),
    format: opts.ctx,
    players,
    picks: heuristicPickValues(opts.pickSeasons, opts.draftRounds, first),
  };
}
