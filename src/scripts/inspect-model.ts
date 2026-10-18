/** Print a compact summary of the analytical model (debugging aid): npm run inspect */
import { loadLeagueModel } from "@/lib/analysis/load-model";

async function main() {
  const { model } = await loadLeagueModel();
  console.log(`Valuation: ${model.valuation.label} (${model.valuation.kind}) | starters/pos ${JSON.stringify(model.startersPerPosition)} | replacement ${JSON.stringify(model.replacementPpg)}`);
  for (const rid of model.standings) {
    const t = model.teams.find((x) => x.team.rosterId === rid)!;
    const g = (["QB", "RB", "WR", "TE"] as const).map((p) => `${p}:${t.positions[p].overall.grade}`).join(" ");
    console.log(
      `${String(t.standingRank).padStart(2)}. ${t.team.teamName.padEnd(26)} ${t.team.wins}-${t.team.losses} PR#${String(t.powerRank).padEnd(2)} lineup ${t.lineup.total.toFixed(1).padStart(6)} ${g} cap:${t.capital.grade} age:${t.age.valueWeighted} → ${t.strategy.inferred} (${t.strategy.confidence}) now=${t.strategy.nowScore} fut=${t.strategy.futureScore}`,
    );
  }
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId);
  if (me) {
    console.log(`\n${me.team.teamName} reasons:\n - ${me.strategy.reasons.join("\n - ")}`);
    console.log(`needs: ${JSON.stringify(me.needs)}\nsurplus: ${me.surplusIds.map((id) => me.players.find((p) => p.id === id)!.name).join(", ")}`);
    console.log(`lineup:`, me.lineup.assignments.map((a) => `${a.slot}=${me.players.find((p) => p.id === a.playerId)?.name}(${a.score})`).join(", "));
  }
  console.log(`\nfree agents: ${model.freeAgents.slice(0, 5).map((p) => `${p.name} ${p.value}`).join(", ")}`);
  console.log(`free agents: ${model.freeAgents.length} (stats source: ${model.statsSource}, projections wks ${model.projectionWeeks.join(",")})`);
  const h = model.history;
  if (h) {
    console.log(`history: seasons ${h.seasonsCovered.join(", ")} · ${h.trades.length} trades`);
    for (const s of h.seasons) console.log(`  ${s.season}: champion ${s.champion?.name ?? "?"}, runner-up ${s.runnerUp?.name ?? "?"}`);
    for (const m of h.managers.slice(0, 5)) console.log(`  ${m.name}: ${m.trades} trades, net ${Math.round(m.hindsightNet)}, activity ${m.activityPct.toFixed(2)}`);
    const t = h.trades.find((x) => x.sides.some((sd) => sd.received.some((a) => a.label.includes("→"))));
    if (t) console.log(`  example: ${t.season} ${t.sides.map((sd) => `${sd.name} got [${sd.received.map((a) => a.label).join(", ")}]=${sd.valueNow}`).join(" | ")}`);
  }
  console.log(`issues: ${model.issues.map((i) => i.code).join(", ") || "none"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
