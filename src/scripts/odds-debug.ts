import { loadLeagueModel } from "@/lib/analysis/load-model";
async function main() {
  const { model } = await loadLeagueModel();
  const o = model.odds!;
  console.log("sd", o.sd, "cal", o.calibration, "reg", o.regularWeeks, "po", o.playoffWeeks);
  for (const t of o.teams.sort((a, b) => b.titlePct - a.titlePct)) {
    const tm = model.teams.find((x) => x.team.rosterId === t.rosterId)!;
    console.log(tm.team.teamName.padEnd(24), `${tm.team.wins}-${tm.team.losses}`, "po", (t.playoffPct*100).toFixed(0), "bye", (t.byePct*100).toFixed(0), "title", (t.titlePct*100).toFixed(1), "ppg", t.projectedPpg, "lineup", tm.lineup.total);
  }
}
main();
