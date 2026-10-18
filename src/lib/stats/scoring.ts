/**
 * Apply a league's Sleeper scoring settings to a raw stat line. Sleeper scoring keys and stat keys
 * share names (e.g. `rec`, `rush_yd`, `pass_td`), so league points = Σ stat × setting.
 * Verified to reproduce Sleeper's own matchup points exactly for this league.
 */
export function scoreStatLine(stats: Record<string, unknown>, scoring: Record<string, number>): number {
  let pts = 0;
  for (const [key, weight] of Object.entries(scoring)) {
    if (!weight) continue;
    const v = stats[key];
    if (typeof v === "number" && Number.isFinite(v)) pts += v * weight;
  }
  return Math.round(pts * 100) / 100;
}

export type StatLine = {
  pts: number;
  gp: number;
  offSnp: number | null;
  tmOffSnp: number | null;
  tgt: number;
  rec: number;
  rushAtt: number;
  passAtt: number;
  recYd: number;
  rushYd: number;
  passYd: number;
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Slim, league-scored line used by the analysis (raw responses stay in the cache for debugging). */
export function toStatLine(stats: Record<string, unknown>, scoring: Record<string, number>): StatLine {
  return {
    pts: scoreStatLine(stats, scoring),
    gp: n(stats.gp),
    offSnp: opt(stats.off_snp),
    tmOffSnp: opt(stats.tm_off_snp),
    tgt: n(stats.rec_tgt),
    rec: n(stats.rec),
    rushAtt: n(stats.rush_att),
    passAtt: n(stats.pass_att),
    recYd: n(stats.rec_yd),
    rushYd: n(stats.rush_yd),
    passYd: n(stats.pass_yd),
  };
}
