import { describe, expect, it } from "vitest";
import { diffAlerts, snapshotFor, type AlertState } from "@/lib/alerts/run";
import { prefsSchema } from "@/lib/prefs/store";
import { model } from "./league-fixture";

const prefs = prefsSchema.parse({ targets: ["player:b-te1"] });

describe("alerts", () => {
  const base = snapshotFor(model, prefs);
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId)!;
  const starter = me.players.find((p) => p.inBestLineup)!;

  it("snapshots my lineup's injuries and where my targets are", () => {
    expect(Object.keys(base.injuries)).toContain(starter.id);
    expect(base.targets["player:b-te1"]).toBe(2);
  });

  it("announces a new serious designation and a recovery, not unchanged ones", () => {
    const prev: AlertState = { ...base, injuries: { ...base.injuries, [starter.id]: "" } };
    const next: AlertState = { ...base, injuries: { ...base.injuries, [starter.id]: "Out" } };
    const a = diffAlerts(model, prev, next);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "injury" });
    expect(a[0].text).toContain(starter.name);
    expect(diffAlerts(model, next, prev)[0]).toMatchObject({ kind: "recovered" });
    expect(diffAlerts(model, next, next)).toEqual([]);
  });

  it("announces a starred target hitting waivers", () => {
    const next: AlertState = { ...base, targets: { "player:b-te1": null } };
    const a = diffAlerts(model, base, next);
    expect(a).toEqual([expect.objectContaining({ kind: "target-dropped" })]);
  });
});
