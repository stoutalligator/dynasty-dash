"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { loadLeagueModel } from "@/lib/analysis/load-model";
import { resolveActiveLeague } from "@/lib/league/active";
import { logger } from "@/lib/log";
import { savedProposalSchema, strategySchema, updatePrefs } from "@/lib/prefs/store";
import { assetIndex } from "@/lib/trades/assets";
import { evaluateTrade, type TradeEvaluation } from "@/lib/trades/evaluate";
import { generateOptionsSchema, generateTrades } from "@/lib/trades/generate";
import { generateThreeTeamTrades, threeTeamOptionsSchema, type ThreeTeamEvaluation } from "@/lib/trades/three-team";
import { annotateThreeTeamOdds, annotateTradeOdds } from "@/lib/server/odds";
import { runDigest } from "@/lib/digest/run";

const log = logger("actions");

async function activeLeagueId(): Promise<string> {
  const a = await resolveActiveLeague();
  if (!a) throw new Error("No league selected.");
  return a.leagueId;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

/** Re-fetch league data ("league") or everything including the player database ("all"). */
export async function refreshData(scope: "league" | "all"): Promise<Result<{ syncedAt: string; warnings: number }>> {
  try {
    const { model } = await loadLeagueModel({ refresh: z.enum(["league", "all"]).parse(scope) });
    refresh();
    return { ok: true, data: { syncedAt: model.generatedAt, warnings: model.issues.filter((i) => i.level !== "info").length } };
  } catch (err) {
    log.error("refresh failed", { error: String(err) });
    return fail(err);
  }
}

export async function setStrategyOverride(rosterId: number, strategy: string | null): Promise<Result<null>> {
  try {
    const s = strategy == null ? null : strategySchema.parse(strategy);
    await updatePrefs(await activeLeagueId(), (p) => {
      const next = { ...p.strategyOverrides };
      if (s) next[String(rosterId)] = s;
      else delete next[String(rosterId)];
      return { ...p, strategyOverrides: next };
    });
    refresh();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const listSchema = z.enum(["untouchables", "tradeBlock", "targets"]);

/** Toggle an asset in one of the trade preference lists. An asset lives in at most one list. */
export async function toggleAssetFlag(list: string, assetId: string): Promise<Result<{ untouchables: string[]; tradeBlock: string[]; targets: string[] }>> {
  try {
    const l = listSchema.parse(list);
    const id = z.string().regex(/^(player|pick):/).parse(assetId);
    const prefs = await updatePrefs(await activeLeagueId(), (p) => {
      const on = p[l].includes(id);
      const strip = (xs: string[]) => xs.filter((x) => x !== id);
      const next = { ...p, untouchables: strip(p.untouchables), tradeBlock: strip(p.tradeBlock), targets: strip(p.targets) };
      if (!on) next[l] = [...next[l], id];
      return next;
    });
    return { ok: true, data: { untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets } };
  } catch (err) {
    return fail(err);
  }
}

export async function findTrades(options: unknown): Promise<Result<TradeEvaluation[]>> {
  try {
    const { model, prefs } = await loadLeagueModel();
    if (model.myRosterId == null) throw new Error("Your team could not be verified; check MY_ROSTER_ID.");
    const o = generateOptionsSchema.parse({ ...(options as object), untouchables: prefs.untouchables, tradeBlock: prefs.tradeBlock, targets: prefs.targets });
    return { ok: true, data: annotateTradeOdds(model, generateTrades(model, model.myRosterId, o), o.objective) };
  } catch (err) {
    return fail(err);
  }
}

const evalSchema = z.object({
  partnerRosterId: z.number(),
  myAssets: z.array(z.string()).max(6),
  theirAssets: z.array(z.string()).max(6),
  objective: strategySchema,
});

export async function evaluateCustomTrade(input: unknown): Promise<Result<TradeEvaluation>> {
  try {
    const i = evalSchema.parse(input);
    const { model } = await loadLeagueModel();
    if (model.myRosterId == null) throw new Error("Your team could not be verified.");
    const idx = assetIndex(model);
    const resolve = (ids: string[], owner: number) =>
      ids.map((id) => {
        const a = idx.get(id);
        if (!a || a.rosterId !== owner) throw new Error(`Asset ${id} is not owned by roster ${owner}`);
        return a;
      });
    const ev = evaluateTrade(model, {
      myRosterId: model.myRosterId,
      partnerRosterId: i.partnerRosterId,
      myGives: resolve(i.myAssets, model.myRosterId),
      theirGives: resolve(i.theirAssets, i.partnerRosterId),
      objective: i.objective,
    });
    return { ok: true, data: annotateTradeOdds(model, [ev], i.objective)[0] };
  } catch (err) {
    return fail(err);
  }
}

export async function saveProposal(input: { partnerRosterId: number; myAssets: string[]; theirAssets: string[]; note?: string }): Promise<Result<null>> {
  try {
    const proposal = savedProposalSchema.parse({ ...input, id: crypto.randomUUID(), savedAt: new Date().toISOString() });
    await updatePrefs(await activeLeagueId(), (p) => ({ ...p, savedProposals: [proposal, ...p.savedProposals].slice(0, 50) }));
    refresh();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProposal(id: string): Promise<Result<null>> {
  try {
    await updatePrefs(await activeLeagueId(), (p) => ({ ...p, savedProposals: p.savedProposals.filter((x) => x.id !== id) }));
    refresh();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Exploratory three-team cycles (A→B, B→C, C→A); computed on demand because the search is larger. */
export async function findThreeTeamTrades(options: unknown): Promise<Result<ThreeTeamEvaluation[]>> {
  try {
    const { model, prefs } = await loadLeagueModel();
    if (model.myRosterId == null) throw new Error("Your team could not be verified; check MY_ROSTER_ID.");
    const o = threeTeamOptionsSchema.parse({ ...(options as object), untouchables: prefs.untouchables });
    return { ok: true, data: annotateThreeTeamOdds(model, generateThreeTeamTrades(model, model.myRosterId, o)) };
  } catch (err) {
    return fail(err);
  }
}

/** Build (and optionally send) the weekly digest on demand. */
export async function generateDigest(deliver: boolean): Promise<Result<{ delivered: { channel: string; ok: boolean; error?: string }[] }>> {
  try {
    const { delivery } = await runDigest({ deliver });
    refresh();
    return { ok: true, data: { delivered: delivery } };
  } catch (err) {
    return fail(err);
  }
}
