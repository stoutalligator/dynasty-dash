import { z } from "zod";
import type { LeagueModel } from "@/lib/analysis/types";
import { strategySchema } from "@/lib/prefs/store";
import { packageValue, teamAssets, type TradeAsset } from "./assets";
import { evaluateTrade, type TradeEvaluation } from "./evaluate";

export const generateOptionsSchema = z.object({
  objective: strategySchema,
  partnerRosterIds: z.array(z.number()).optional(),
  /** Filter what I receive: positions (QB/RB/WR/TE) and/or "PICK". Empty = any. */
  positions: z.array(z.string()).default([]),
  maxAge: z.number().min(18).max(45).optional(),
  minAge: z.number().min(18).max(45).optional(),
  /** Allow my draft picks to be offered. */
  offerPicks: z.boolean().default(true),
  /** Allow receiving draft picks. */
  receivePicks: z.boolean().default(true),
  maxAssetsPerSide: z.number().int().min(1).max(3).default(2),
  untouchables: z.array(z.string()).default([]),
  tradeBlock: z.array(z.string()).default([]),
  targets: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(100).default(30),
  perPartner: z.number().int().min(1).max(20).default(4),
});
export type GenerateOptions = z.input<typeof generateOptionsSchema>;

/** Ignore near-worthless filler so proposals stay realistic. */
const MIN_ASSET_VALUE = 250;
const POOL_SIZE = 14;

function combos<T>(items: T[], max: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length) out.push([...acc]);
    if (acc.length === max) return;
    for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i]]);
  };
  rec(0, []);
  return out;
}

/** Top assets by value, always keeping explicitly flagged ones. */
function pool(assets: TradeAsset[], flagged: Set<string>): TradeAsset[] {
  const sorted = assets.filter((a) => a.value >= MIN_ASSET_VALUE).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, POOL_SIZE);
  for (const a of sorted) if (flagged.has(a.assetId) && !top.includes(a)) top.push(a);
  return top;
}

/**
 * Generate two-team trade candidates for my team across the league (or selected partners),
 * evaluate each with `evaluateTrade`, and return the best-ranked, de-duplicated proposals.
 *
 * Packages are only considered when their adjusted values are within ±25% of each other, so
 * the engine searches for plausible deals rather than lopsided ones.
 */
export function generateTrades(model: LeagueModel, myRosterId: number, input: GenerateOptions): TradeEvaluation[] {
  const o = generateOptionsSchema.parse(input);
  const me = model.teams.find((t) => t.team.rosterId === myRosterId);
  if (!me) throw new Error(`Roster ${myRosterId} not found`);
  const untouchable = new Set(o.untouchables);
  const block = new Set(o.tradeBlock);
  const targets = new Set(o.targets);

  const myPool = pool(
    teamAssets(me).filter((a) => !untouchable.has(a.assetId) && (o.offerPicks || a.kind !== "pick")),
    block,
  );
  const myCombos = combos(myPool, o.maxAssetsPerSide).map((c) => ({ assets: c, value: packageValue(c.map((a) => a.value)) }));

  const wantsAsset = (a: TradeAsset) => {
    if (a.kind === "pick") return o.receivePicks && (o.positions.length === 0 || o.positions.includes("PICK"));
    if (o.positions.length && !o.positions.includes(a.position ?? "")) return false;
    if (o.maxAge != null && (a.age == null || a.age > o.maxAge)) return false;
    if (o.minAge != null && (a.age == null || a.age < o.minAge)) return false;
    return true;
  };

  const partners = model.teams.filter(
    (t) => t.team.rosterId !== myRosterId && (!o.partnerRosterIds?.length || o.partnerRosterIds.includes(t.team.rosterId)),
  );

  const results: TradeEvaluation[] = [];
  for (const partner of partners) {
    const theirAll = teamAssets(partner);
    const theirPool = pool(theirAll.filter(wantsAsset), targets);
    // Their combos must contain at least one asset I want; extra pieces may be any of their assets in the pool.
    const theirCombos = combos(theirPool, o.maxAssetsPerSide).map((c) => ({ assets: c, value: packageValue(c.map((a) => a.value)) }));
    const candidates: TradeEvaluation[] = [];
    for (const theirs of theirCombos) {
      for (const mine of myCombos) {
        const hi = Math.max(theirs.value, mine.value);
        if (Math.abs(theirs.value - mine.value) > 0.25 * hi) continue;
        // Skip packages where a throw-in is under 15% of the headline asset (filler noise).
        if (hasFiller(theirs.assets) || hasFiller(mine.assets)) continue;
        const ev = evaluateTrade(model, {
          myRosterId,
          partnerRosterId: partner.team.rosterId,
          myGives: mine.assets,
          theirGives: theirs.assets,
          objective: o.objective,
        });
        if (ev.partner.score < -1) continue;
        // Bonuses for user preferences (trade block out, targets in).
        const pref = mine.assets.filter((a) => block.has(a.assetId)).length * 0.75 + theirs.assets.filter((a) => targets.has(a.assetId)).length * 1;
        ev.overall = Math.round((ev.overall + pref) * 100) / 100;
        if (ev.mine.score <= 0 && pref === 0) continue;
        candidates.push(ev);
      }
    }
    candidates.sort((a, b) => b.overall - a.overall);
    // Diversity: don't repeat the same headline incoming asset within a partner.
    const seenHeadline = new Set<string>();
    let kept = 0;
    for (const c of candidates) {
      const headline = [...c.mine.gets].sort((a, b) => b.value - a.value)[0]?.assetId;
      if (headline && seenHeadline.has(headline)) continue;
      if (headline) seenHeadline.add(headline);
      results.push(c);
      if (++kept >= o.perPartner) break;
    }
  }
  // Variety: the same outgoing headline asset leads at most three proposals.
  const outgoingUses = new Map<string, number>();
  return results
    .sort((a, b) => b.overall - a.overall)
    .filter((e) => {
      const head = [...e.mine.gives].sort((a, b) => b.value - a.value)[0]?.assetId ?? "";
      const n = outgoingUses.get(head) ?? 0;
      outgoingUses.set(head, n + 1);
      return n < 3;
    })
    .slice(0, o.limit);
}

function hasFiller(assets: TradeAsset[]) {
  if (assets.length < 2) return false;
  const max = Math.max(...assets.map((a) => a.value));
  return assets.some((a) => a.value < 0.15 * max);
}
