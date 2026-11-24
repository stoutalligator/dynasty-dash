import { describe, expect, it } from "vitest";
import { gradeFor, sideComposite, verdict } from "@/lib/trades/calculator";
import type { SideImpact, TradeEvaluation } from "@/lib/trades/evaluate";

const side = (over: Partial<SideImpact>): SideImpact =>
  ({ rosterId: 1, teamName: "A", strategy: "retool", gives: [{}], gets: [{}], valueOut: 5000, valueIn: 5000, netValue: 0, lens: "blend", lineupBefore: 0, lineupAfter: 0, lineupDelta: 0, positionDeltas: [], ageBefore: null, ageAfter: null, futureDelta: 0, pickValueDelta: 0, needsAddressed: [], rosterOverflow: 0, cuts: [], score: 0, reasonsFor: [], reasonsAgainst: [], ...over }) as SideImpact;

describe("trade calculator", () => {
  it("grades an even swap as B and a big win as A+", () => {
    expect(gradeFor(sideComposite(side({})))).toBe("B");
    expect(gradeFor(sideComposite(side({ valueIn: 8000, netValue: 3000, score: 3 })))).toBe("A+");
    expect(gradeFor(sideComposite(side({ valueIn: 2000, netValue: -3000, score: -3 })))).toBe("F");
  });

  it("caps team fit so it can't rescue a lopsided deal", () => {
    expect(sideComposite(side({ valueIn: 3000, netValue: -2000, score: 50 }))).toBeLessThan(-30);
  });

  it("calls near-even deals fair and names the winner otherwise", () => {
    const ev = (inA: number, outA: number) =>
      ({ mine: side({ teamName: "A", valueIn: inA, valueOut: outA }), partner: side({ teamName: "B", valueIn: outA, valueOut: inA }), valueBalance: (inA - outA) / Math.max(inA, outA) }) as unknown as TradeEvaluation;
    expect(verdict(ev(5000, 4900)).headline).toBe("Fair trade");
    expect(verdict(ev(6000, 4000)).headline).toBe("A wins by a lot");
    expect(verdict(ev(4000, 4500)).headline).toBe("B wins a little");
  });
});
