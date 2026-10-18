import { buildWaiverBoard } from "@/lib/analysis/waivers";
import type { LeagueModel, Strategy } from "@/lib/analysis/types";
import { fmtInt, fmtPts, ordinal } from "@/lib/format";
import type { TradeEvaluation } from "@/lib/trades/evaluate";

export type DigestItem = { title: string; detail?: string; tag?: "new" | "up" | "down" };
export type DigestSection = { key: string; title: string; items: DigestItem[]; empty?: string };

/** Compact state remembered between digests so changes can be called out. */
export type DigestMemory = {
  week: number | null;
  injuries: Record<string, string>;
  strategies: Record<string, Strategy>;
  odds: { playoff: number; title: number } | null;
};

export type Digest = {
  generatedAt: string;
  league: string;
  team: string;
  week: number | null;
  headline: string;
  sections: DigestSection[];
  memory: DigestMemory;
};

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** Build the weekly digest from the current model, comparing against the previous digest. */
export function buildDigest(model: LeagueModel, trades: TradeEvaluation[], previous: DigestMemory | null): Digest {
  const me = model.teams.find((t) => t.team.rosterId === model.myRosterId) ?? null;
  const week = model.league.currentWeek;
  const odds = me ? (model.odds?.teams.find((o) => o.rosterId === me.team.rosterId) ?? null) : null;

  const memory: DigestMemory = {
    week,
    injuries: Object.fromEntries((me?.players ?? []).filter((p) => p.injury).map((p) => [p.id, p.injury!.status])),
    strategies: Object.fromEntries(model.teams.map((t) => [String(t.team.rosterId), t.strategy.effective])),
    odds: odds ? { playoff: odds.playoffPct, title: odds.titlePct } : null,
  };

  const headlineParts = [me ? `${me.team.teamName} ${me.team.wins}-${me.team.losses}, ${ordinal(me.standingRank)} of ${model.teams.length}` : model.league.name];
  if (odds) {
    const dTitle = previous?.odds ? odds.titlePct - previous.odds.title : null;
    const dPlay = previous?.odds ? odds.playoffPct - previous.odds.playoff : null;
    headlineParts.push(
      `playoffs ${pct(odds.playoffPct)}${dPlay != null && Math.abs(dPlay) >= 0.01 ? ` (${dPlay > 0 ? "+" : ""}${Math.round(dPlay * 100)} pts)` : ""}, title ${pct(odds.titlePct)}${dTitle != null && Math.abs(dTitle) >= 0.005 ? ` (${dTitle > 0 ? "+" : ""}${(dTitle * 100).toFixed(1)})` : ""}`,
    );
  }

  const sections: DigestSection[] = [];

  // Waiver wire
  const board = buildWaiverBoard(model, me, model.league.waiverBudget);
  const fits = board.candidates.filter((c) => c.tier !== "Monitor" && (c.lineupGain > 0.05 || c.fillsNeed || c.tier === "Strong add")).slice(0, 4);
  sections.push({
    key: "waivers",
    title: board.faab ? `Waiver wire ($${board.faab.remaining} FAAB left)` : "Waiver wire",
    items: fits.map((c) => ({
      title: `${c.player.name} (${c.player.position}, ${c.player.nflTeam ?? "FA"}) · ${c.tier}${c.lineupGain > 0.05 ? ` · +${fmtPts(c.lineupGain)} to your lineup` : ""}`,
      detail: c.reasons.slice(0, 2).join("; "),
    })),
    empty: "No free agent stands out for your roster this week.",
  });

  // Injuries on my roster
  const injured = (me?.players ?? []).filter((p) => p.injury && p.slot !== "taxi");
  sections.push({
    key: "injuries",
    title: "Your injury report",
    items: injured.map((p) => ({
      title: `${p.name} (${p.position}): ${p.injury!.status}${p.injury!.bodyPart ? `, ${p.injury!.bodyPart}` : ""}`,
      detail: p.inBestLineup ? `In your best lineup (${fmtPts(p.lineupImpact)} adj. PPG at stake)` : undefined,
      tag: previous && previous.injuries[p.id] !== p.injury!.status ? "new" : undefined,
    })),
    empty: "No injury designations on your active roster.",
  });

  // Trade ideas
  sections.push({
    key: "trades",
    title: `Trade ideas (${me?.strategy.effective ?? "retool"} objective)`,
    items: trades.slice(0, 3).map((e) => ({
      title: `${e.partner.teamName}: give ${e.mine.gives.map((a) => a.label).join(" + ")} for ${e.mine.gets.map((a) => a.label).join(" + ")}`,
      detail: [
        `lineup ${e.mine.lineupDelta >= 0 ? "+" : ""}${fmtPts(e.mine.lineupDelta)} PPG`,
        `value ${e.mine.netValue >= 0 ? "+" : ""}${fmtInt(e.mine.netValue)}`,
        e.odds ? `title ${pct(e.odds.mine.titleBefore)} → ${pct(e.odds.mine.titleAfter)}` : null,
        e.partnerOutlook,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    empty: "No trade cleared the realism filters.",
  });

  // League posture changes and the deadline
  const league: DigestItem[] = [];
  if (previous) {
    for (const t of model.teams) {
      const before = previous.strategies[String(t.team.rosterId)];
      if (before && before !== t.strategy.effective && !t.team.isMine) {
        league.push({ title: `${t.team.teamName}: ${before} → ${t.strategy.effective}`, detail: t.strategy.effective === "rebuild" ? "Possible seller of veterans." : t.strategy.effective === "contender" ? "Possible buyer of starters." : undefined, tag: "new" });
      }
    }
  }
  const deadline = model.league.tradeDeadline;
  if (deadline && week != null && week <= deadline) league.push({ title: `Trade deadline: week ${deadline} (${deadline - week === 0 ? "this week" : `${deadline - week} week${deadline - week > 1 ? "s" : ""} away`})` });
  if (model.odds) {
    const top = [...model.odds.teams].sort((a, b) => b.titlePct - a.titlePct).slice(0, 3);
    league.push({ title: `Title favorites: ${top.map((o) => `${model.teams.find((t) => t.team.rosterId === o.rosterId)?.team.teamName} ${pct(o.titlePct)}`).join(", ")}` });
  }
  sections.push({ key: "league", title: "Around the league", items: league, empty: "No notable changes." });

  return {
    generatedAt: new Date().toISOString(),
    league: model.league.name,
    team: me?.team.teamName ?? "",
    week,
    headline: headlineParts.join(" · "),
    sections,
    memory,
  };
}

/** Plain-text rendering for webhooks and push notifications. */
export function digestText(d: Digest, appUrl?: string): string {
  const lines = [`**${d.league}, week ${d.week ?? "?"} digest**`, d.headline, ""];
  for (const s of d.sections) {
    lines.push(`__${s.title}__`);
    if (!s.items.length) lines.push(`- ${s.empty ?? "Nothing new."}`);
    for (const i of s.items) lines.push(`- ${i.tag === "new" ? "[new] " : ""}${i.title}${i.detail ? ` (${i.detail})` : ""}`);
    lines.push("");
  }
  if (appUrl) lines.push(`${appUrl.replace(/\/$/, "")}/digest`);
  return lines.join("\n").trim();
}
