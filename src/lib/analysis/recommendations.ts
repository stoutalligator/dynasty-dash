import { ordinal } from "@/lib/league/picks";
import type { TradeEvaluation } from "@/lib/trades/evaluate";
import { median } from "./grades";
import type { LeagueModel, PlayerView, Strategy, TeamAnalysis } from "./types";

export type Recommendation = { title: string; detail: string; kind: "upgrade" | "sell" | "keep" | "target" | "info" };

const names = (ps: PlayerView[]) =>
  ps
    .map((p) => `${p.name} (${p.position}${p.age != null ? `, ${Math.floor(p.age)}` : ""}${p.lineupImpact > 0 ? `; −${p.lineupImpact.toFixed(1)} lineup PPG if moved` : ""})`)
    .join(", ");

/**
 * Scenario-specific, data-grounded actions for one team. Every statement is computed from the
 * model; trade ideas come from the trade engine for the matching objective.
 */
export function recommendationsFor(
  model: LeagueModel,
  team: TeamAnalysis,
  tradesByObjective: Partial<Record<Strategy, TradeEvaluation[]>>,
): Record<Strategy, Recommendation[]> {
  const others = model.teams.filter((t) => t.team.rosterId !== team.team.rosterId);
  const tradable = team.players.filter((p) => p.slot !== "reserve" && (p.value ?? 0) > 0);
  const sellVets = tradable.filter((p) => p.ageRisk && (p.value ?? 0) >= 1500).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const expendable = tradable.filter((p) => p.tags.includes("Expendable")).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const youngCore = tradable.filter((p) => p.age != null && p.age <= 25 && (p.value ?? 0) >= 3000).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const contenders = others.filter((t) => t.strategy.effective === "contender");
  const rebuilders = others.filter((t) => t.strategy.effective === "rebuild");

  const needLines = team.needs.map((n) => ({ title: `Upgrade ${n.position}`, detail: n.reason, kind: "upgrade" as const }));
  const worstSlot = team.lineup.assignments
    .map((a) => {
      const leagueMed = median(model.teams.map((t) => t.lineup.assignments.filter((x) => x.slot === a.slot).map((x) => x.score)).flat());
      return { ...a, gap: a.score - leagueMed, leagueMed };
    })
    .sort((a, b) => a.gap - b.gap)[0];

  const tradeLine = (o: Strategy): Recommendation[] =>
    (tradesByObjective[o] ?? []).slice(0, 2).map((e) => ({
      title: `Explore with ${e.partner.teamName}`,
      detail: `Give ${e.mine.gives.map((a) => a.label).join(" + ")} for ${e.mine.gets.map((a) => a.label).join(" + ")} — lineup ${e.mine.lineupDelta >= 0 ? "+" : ""}${e.mine.lineupDelta.toFixed(1)} adj. PPG, value ${e.mine.netValue >= 0 ? "+" : ""}${e.mine.netValue.toLocaleString()}. ${e.partnerOutlook} (their ${e.partner.strategy} incentives).`,
      kind: "target",
    }));

  const qbNote =
    model.league.format.superflex && team.positions.QB.starterRank > Math.ceil(model.teams.length / 2)
      ? [{ title: "Superflex QB gap", detail: `Your top-${model.startersPerPosition.QB} QBs rank ${ordinal(team.positions.QB.starterRank)} in production. Two startable QBs matter more in superflex than any single flex upgrade.`, kind: "upgrade" as const }]
      : [];

  const contend: Recommendation[] = [
    ...qbNote,
    ...needLines.filter((l) => !(qbNote.length && l.title.endsWith("QB"))),
    ...(worstSlot && worstSlot.gap < 0
      ? [{ title: `Weakest lineup slot: ${worstSlot.slot}`, detail: `Scores ${worstSlot.score.toFixed(1)} adj. PPG vs. a league median of ${worstSlot.leagueMed.toFixed(1)} for that slot.`, kind: "upgrade" as const }]
      : []),
    ...(expendable.length ? [{ title: "Use bench value as currency", detail: `Not in your best lineup but carry trade value: ${names(expendable.slice(0, 4))}.`, kind: "sell" as const }] : []),
    ...(team.picks.length ? [{ title: "Picks available to spend", detail: `${team.capital.firsts} firsts and ${team.capital.seconds} seconds (${ordinal(team.capital.rank)} in draft capital). Rebuilders most likely to value picks: ${rebuilders.map((t) => t.team.teamName).join(", ") || "none identified"}.`, kind: "info" as const }] : []),
    ...tradeLine("contender"),
  ];

  const retool: Recommendation[] = [
    ...(youngCore.length ? [{ title: "Keep the young core", detail: names(youngCore.slice(0, 5)), kind: "keep" as const }] : []),
    ...(sellVets.length ? [{ title: "Sell-high candidates", detail: `Past typical decline age but still valuable: ${names(sellVets.slice(0, 4))}. Contenders: ${contenders.map((t) => t.team.teamName).join(", ") || "none identified"}.`, kind: "sell" as const }] : []),
    ...(expendable.length >= 2 ? [{ title: "Consolidate depth", detail: `${expendable.length} bench players hold value without lineup impact; 2-for-1 deals can upgrade ${team.needs[0]?.position ?? "your weakest spot"}.`, kind: "upgrade" as const }] : []),
    ...needLines.slice(0, 2),
    ...tradeLine("retool"),
  ];

  const rebuild: Recommendation[] = [
    ...(sellVets.length || tradable.some((p) => (p.age ?? 0) >= 27)
      ? [{ title: "Sell veterans to contenders", detail: `${names((sellVets.length ? sellVets : tradable.filter((p) => (p.age ?? 0) >= 27).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))).slice(0, 4))}. Contenders: ${contenders.map((t) => t.team.teamName).join(", ") || "none identified"}.`, kind: "sell" as const }]
      : []),
    ...(contenders.length
      ? [{ title: "Target contenders' picks", detail: `Picks held by current contenders project later in the round: ${contenders.map((t) => `${t.team.teamName} (${t.capital.firsts} 1sts)`).join(", ")}.`, kind: "target" as const }]
      : []),
    ...(model.league.format.superflex ? [{ title: "Prioritize young QBs", detail: "In superflex, QBs aged 25 or younger hold value longest; acquire them before they break out.", kind: "info" as const }] : []),
    ...(youngCore.length ? [{ title: "Build around", detail: names(youngCore.slice(0, 5)), kind: "keep" as const }] : []),
    ...tradeLine("rebuild"),
  ];

  return { contender: contend, retool, rebuild };
}

/** League-wide opportunity signals (used on the League and Trade pages). */
export function leagueOpportunities(model: LeagueModel) {
  const n = model.teams.length;
  const qbWeak = model.league.format.superflex ? model.teams.filter((t) => t.positions.QB.starterRank > n - Math.ceil(n / 3)) : [];
  const surplusByPos = model.gradedPositions.map((pos) => ({
    position: pos,
    teams: model.teams
      .filter((t) => t.positions[pos].depthRank <= Math.ceil(n / 4))
      .map((t) => ({ rosterId: t.team.rosterId, teamName: t.team.teamName, depthPpg: t.positions[pos].depthPpg })),
  }));
  const contendersNeeding = model.teams
    .filter((t) => t.strategy.effective === "contender" && t.needs.length)
    .map((t) => ({ rosterId: t.team.rosterId, teamName: t.team.teamName, needs: t.needs.map((x) => x.position) }));
  return { qbWeak: qbWeak.map((t) => ({ rosterId: t.team.rosterId, teamName: t.team.teamName, rank: t.positions.QB.starterRank })), surplusByPos, contendersNeeding };
}
