import { describe, expect, it } from "vitest";
import { tradeWindow, tradeWindowNote } from "@/lib/league/trade-window";

const lg = (currentWeek: number | null, tradeDeadline: number | null, status = "in_season") => ({ status, currentWeek, tradeDeadline });

describe("tradeWindow", () => {
  it("is open before the deadline and counts weeks left", () => {
    expect(tradeWindow(lg(8, 11))).toEqual({ state: "open", weeksLeft: 3, deadline: 11 });
    expect(tradeWindowNote(tradeWindow(lg(8, 11)))).toMatch(/in 3 weeks/);
    expect(tradeWindowNote(tradeWindow(lg(2, 11)))).toBeNull();
  });
  it("flags the deadline week", () => {
    expect(tradeWindow(lg(11, 11)).state).toBe("deadline-week");
    expect(tradeWindowNote(tradeWindow(lg(11, 11)))).toMatch(/Last chance to trade.*week 12 begins/);
  });
  it("is closed after the deadline during the season", () => {
    expect(tradeWindow(lg(12, 11)).state).toBe("closed");
  });
  it("is open in the offseason and when there is no deadline", () => {
    expect(tradeWindow(lg(18, 11, "complete")).state).toBe("open");
    expect(tradeWindow(lg(1, 11, "pre_draft")).state).toBe("open");
    expect(tradeWindow(lg(12, 0)).state).toBe("open");
    expect(tradeWindow(lg(12, null)).state).toBe("open");
  });
});
