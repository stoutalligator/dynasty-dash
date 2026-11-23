import { describe, expect, it } from "vitest";
import { inferByeWeeks } from "@/lib/analysis/model";

/** 20 teams × 2 players; `byes` maps team → week with no projections. */
function projections(weeks: number[], byes: Record<string, number>) {
  const teams = Array.from({ length: 20 }, (_, i) => `T${i}`);
  const team = new Map<string, string>();
  const out = new Map<number, Map<string, { pts: number }>>();
  for (const w of weeks) {
    const lines = new Map<string, { pts: number }>();
    for (const t of teams) {
      for (const k of [0, 1]) {
        const id = `${t}-${k}`;
        team.set(id, t);
        if (byes[t] !== w) lines.set(id, { pts: 10 });
      }
    }
    out.set(w, lines);
  }
  return { out, teamOf: (id: string) => team.get(id) ?? null };
}

describe("inferByeWeeks", () => {
  it("finds the week a team has no projected players", () => {
    const { out, teamOf } = projections([5, 6, 7, 8], { T1: 6, T2: 6, T3: 8 });
    const byes = inferByeWeeks(out, teamOf);
    expect(byes.get("T1")).toBe(6);
    expect(byes.get("T2")).toBe(6);
    expect(byes.get("T3")).toBe(8);
    expect(byes.has("T4")).toBe(false);
  });

  it("ignores sparse weeks that aren't published yet", () => {
    const { out, teamOf } = projections([5, 6], {});
    out.set(7, new Map([["T0-0", { pts: 10 }]]));
    expect(inferByeWeeks(out, teamOf).size).toBe(0);
  });
});
