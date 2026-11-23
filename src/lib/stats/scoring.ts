/**
 * Apply a league's Sleeper scoring settings to a raw stat line. Sleeper scoring keys and stat keys
 * share names (e.g. `rec`, `rush_yd`, `pass_td`), so league points = Σ stat × setting.
 * Verified to reproduce Sleeper's own matchup points exactly for this league.
 */
export function scoreStatLine(stats: Record<string, unknown>, scoring: Record<string, number>): number {
  const weights = compiled(scoring);
  let pts = 0;
  for (let i = 0; i < weights.length; i++) {
    const v = stats[weights[i][0]];
    if (typeof v === "number" && Number.isFinite(v)) pts += v * weights[i][1];
  }
  return Math.round(pts * 100) / 100;
}

/**
 * Non-zero scoring weights, computed once per settings object. Scoring runs for every player in
 * every week of stats and projections (~150k lines), so re-walking ~100 settings each time dominated
 * cold model builds.
 */
const compiledCache = new WeakMap<Record<string, number>, [string, number][]>();
function compiled(scoring: Record<string, number>): [string, number][] {
  let w = compiledCache.get(scoring);
  if (!w) {
    w = Object.entries(scoring).filter(([, v]) => typeof v === "number" && v !== 0);
    compiledCache.set(scoring, w);
  }
  return w;
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
