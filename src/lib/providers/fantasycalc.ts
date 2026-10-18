import { z } from "zod";
import { fetchJson } from "@/lib/sleeper/http";
import type { PickValuation, ProviderContext, ValuationProvider } from "./types";

/**
 * FantasyCalc dynasty values (https://fantasycalc.com), derived from real fantasy trades.
 * The endpoint is public and keyless but undocumented, so it may change without notice;
 * responses are validated and failures fall back to the internal estimate.
 */
const entrySchema = z.looseObject({
  player: z.looseObject({
    name: z.string(),
    sleeperId: z.string().nullish(),
    position: z.string(),
  }),
  value: z.number(),
  redraftValue: z.number().nullish(),
  overallRank: z.number().nullish(),
  positionRank: z.number().nullish(),
  trend30Day: z.number().nullish(),
});
const responseSchema = z.array(entrySchema);

const ROUND = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 } as const;

/** Parses names such as "2027 1st", "2027 1st (Early)" or "2028 2nd". */
export function parsePickName(name: string): Omit<PickValuation, "value"> | null {
  const m = /^(\d{4}) (1st|2nd|3rd|4th|5th)(?: \((Early|Mid|Late)\))?$/i.exec(name.trim());
  if (!m) return null;
  return {
    season: m[1],
    round: ROUND[m[2].toLowerCase() as keyof typeof ROUND],
    bucket: m[3] ? (m[3].toLowerCase() as "early" | "mid" | "late") : null,
  };
}

export function buildFantasyCalcUrl(ctx: ProviderContext) {
  const qs = new URLSearchParams({
    isDynasty: String(ctx.dynasty !== false),
    numQbs: ctx.superflex ? "2" : "1",
    numTeams: String(ctx.teams),
    ppr: String(ctx.receptionPoints),
  });
  return `https://api.fantasycalc.com/values/current?${qs}`;
}

export const fantasyCalcProvider: ValuationProvider = {
  id: "fantasycalc",
  label: "FantasyCalc",
  async fetch(ctx) {
    const rows = await fetchJson(buildFantasyCalcUrl(ctx), responseSchema, { timeoutMs: 20_000 });
    const players: Record<string, { value: number; redraftValue: number | null; overallRank: number | null; positionRank: number | null; trend30Day: number | null }> = {};
    const names: Record<string, string> = {};
    const picks: PickValuation[] = [];
    for (const r of rows) {
      if (r.player.position === "PICK") {
        const parsed = parsePickName(r.player.name);
        if (parsed) picks.push({ ...parsed, value: r.value });
        continue;
      }
      if (!r.player.sleeperId) continue;
      players[r.player.sleeperId] = {
        value: r.value,
        redraftValue: r.redraftValue ?? null,
        overallRank: r.overallRank ?? null,
        positionRank: r.positionRank ?? null,
        trend30Day: r.trend30Day ?? null,
      };
      names[r.player.sleeperId] = r.player.name;
    }
    if (Object.keys(players).length < 50) throw new Error(`FantasyCalc returned only ${Object.keys(players).length} players`);
    return {
      providerId: "fantasycalc",
      label: "FantasyCalc",
      kind: "third-party",
      description: `FantasyCalc ${ctx.dynasty === false ? "redraft" : "dynasty"} trade values for ${ctx.teams}-team, ${ctx.superflex ? "superflex" : "1QB"}, ${ctx.receptionPoints} PPR leagues. Third-party market data, not official.`,
      format: ctx,
      players,
      picks,
      names,
    };
  },
};
