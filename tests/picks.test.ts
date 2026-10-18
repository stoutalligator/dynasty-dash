import { describe, expect, it } from "vitest";
import { resolvePickOwnership } from "@/lib/league/picks";

const base = { leagueSeason: "2026", draftRounds: 2, rosterIds: [1, 2, 3], futureSeasons: 2 };

describe("resolvePickOwnership", () => {
  it("starts after a completed draft and applies traded picks", () => {
    const { picks, seasons } = resolvePickOwnership({
      ...base,
      drafts: [{ draft_id: "d", season: "2026", status: "complete" }],
      tradedPicks: [
        { season: "2027", round: 1, roster_id: 1, owner_id: 3, previous_owner_id: 1 },
        { season: "2026", round: 1, roster_id: 2, owner_id: 1, previous_owner_id: 2 },
      ],
    });
    expect(seasons).toEqual(["2027", "2028"]);
    expect(picks).toHaveLength(2 * 2 * 3);
    expect(picks.find((x) => x.season === "2027" && x.round === 1 && x.originalRosterId === 1)).toMatchObject({
      ownerRosterId: 3,
      source: "traded_picks",
      previousOwnerRosterId: 1,
    });
    expect(picks.find((x) => x.season === "2027" && x.round === 1 && x.originalRosterId === 2)).toMatchObject({ ownerRosterId: 2, source: "implied" });
  });

  it("includes the current season when its draft is pending, with slots", () => {
    const { picks, seasons } = resolvePickOwnership({
      ...base,
      // Sleeper includes an empty "" → null entry; it must not break validation or mapping.
      drafts: [{ draft_id: "d", season: "2026", status: "pre_draft", slot_to_roster_id: { "1": 3, "2": 1, "3": 2, "": null } }],
      tradedPicks: [],
    });
    expect(seasons[0]).toBe("2026");
    expect(picks.find((x) => x.season === "2026" && x.originalRosterId === 3)?.slot).toBe(1);
  });

  it("extends to seasons present in traded picks and reports unknown rosters", () => {
    const { seasons, issues } = resolvePickOwnership({
      ...base,
      drafts: [],
      tradedPicks: [{ season: "2030", round: 1, roster_id: 9, owner_id: 1 }],
    });
    expect(seasons).toContain("2030");
    expect(issues.some((i) => i.code === "pick-unknown-roster")).toBe(true);
  });
});
