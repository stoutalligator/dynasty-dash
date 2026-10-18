import type { Grade } from "./types";

/** Rank values descending (1 = highest). Ties share the better rank. */
export function rankDesc(values: number[]): number[] {
  return values.map((v) => 1 + values.filter((x) => x > v).length);
}

/** Rank values ascending (1 = lowest). */
export function rankAsc(values: number[]): number[] {
  return values.map((v) => 1 + values.filter((x) => x < v).length);
}

/** Percentile in [0, 1] where rank 1 of n maps to 1. */
export function rankPct(rank: number, n: number): number {
  return n <= 1 ? 1 : (n - rank) / (n - 1);
}

export function letter(pct: number): string {
  const scale: [number, string][] = [
    [0.92, "A+"], [0.82, "A"], [0.72, "A-"], [0.62, "B+"], [0.52, "B"], [0.45, "B-"],
    [0.38, "C+"], [0.3, "C"], [0.22, "C-"], [0.12, "D"],
  ];
  return scale.find(([t]) => pct >= t)?.[1] ?? "F";
}

export function gradeFromRank(rank: number, n: number): Grade {
  const pct = rankPct(rank, n);
  return { score: Math.round(pct * 100), grade: letter(pct), rank };
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
