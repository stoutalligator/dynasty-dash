import type { SleeperDraft, SleeperTradedPick } from "@/lib/sleeper/schemas";
import type { DraftPick, Issue } from "./models";

export type ResolvePicksInput = {
  leagueSeason: string;
  draftRounds: number | null;
  rosterIds: number[];
  drafts: SleeperDraft[];
  tradedPicks: SleeperTradedPick[];
  futureSeasons: number;
};

/**
 * Resolve draft-pick ownership for upcoming rookie drafts.
 *
 * Sleeper's traded_picks endpoint only lists picks that changed hands; every other pick is
 * implied to belong to its original team. The current season's pick is included only while
 * its draft has not been completed.
 */
export function resolvePickOwnership(input: ResolvePicksInput): { picks: DraftPick[]; seasons: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const season = Number(input.leagueSeason);
  const currentDraft = input.drafts.find((d) => d.season === input.leagueSeason);
  const currentDone = currentDraft?.status === "complete";
  const start = currentDone ? season + 1 : season;
  const seasons = new Set<number>();
  for (let s = start; s < start + input.futureSeasons; s++) seasons.add(s);
  for (const tp of input.tradedPicks) if (Number(tp.season) >= start) seasons.add(Number(tp.season));

  const rounds = input.draftRounds ?? currentDraft?.settings?.rounds ?? null;
  if (rounds == null) {
    issues.push({ level: "warning", code: "draft-rounds-unknown", message: "League draft_rounds is missing; only traded picks can be shown." });
  }

  const known = new Set(input.rosterIds);
  const traded = new Map<string, SleeperTradedPick>();
  for (const tp of input.tradedPicks) {
    if (Number(tp.season) < start) continue;
    if (!known.has(tp.roster_id) || !known.has(tp.owner_id)) {
      issues.push({ level: "warning", code: "pick-unknown-roster", message: `Traded pick ${tp.season} R${tp.round} references an unknown roster.`, context: { ...tp } });
    }
    if (rounds != null && tp.round > rounds) {
      issues.push({ level: "info", code: "pick-round-out-of-range", message: `Traded pick ${tp.season} R${tp.round} exceeds the configured ${rounds} draft rounds.`, context: { ...tp } });
    }
    traded.set(`${tp.season}-${tp.round}-${tp.roster_id}`, tp);
  }

  // Draft slots are only known once Sleeper publishes an order for that season's draft.
  const slotsBySeason = new Map<string, Map<number, number>>();
  for (const d of input.drafts) {
    if (d.status === "complete" || !d.slot_to_roster_id) continue;
    const m = new Map<number, number>();
    for (const [slot, rid] of Object.entries(d.slot_to_roster_id)) if (rid != null && slot !== "") m.set(rid, Number(slot));
    slotsBySeason.set(d.season, m);
  }

  const picks: DraftPick[] = [];
  const sortedSeasons = [...seasons].sort((a, b) => a - b).map(String);
  for (const s of sortedSeasons) {
    const maxRound = Math.max(rounds ?? 0, ...input.tradedPicks.filter((t) => t.season === s).map((t) => t.round));
    for (let round = 1; round <= maxRound; round++) {
      for (const rid of input.rosterIds) {
        const tp = traded.get(`${s}-${round}-${rid}`);
        picks.push({
          season: s,
          round,
          originalRosterId: rid,
          ownerRosterId: tp?.owner_id ?? rid,
          previousOwnerRosterId: tp?.previous_owner_id ?? null,
          source: tp ? "traded_picks" : "implied",
          slot: slotsBySeason.get(s)?.get(rid) ?? null,
        });
      }
    }
  }
  return { picks, seasons: sortedSeasons, issues };
}

export function pickId(p: Pick<DraftPick, "season" | "round" | "originalRosterId">) {
  return `pick:${p.season}:${p.round}:${p.originalRosterId}`;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
