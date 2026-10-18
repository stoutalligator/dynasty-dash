import type { Transaction } from "@/lib/league/models";
import { ordinal } from "@/lib/league/picks";
import type { HistoricalSeason, LeagueHistory } from "./load";

export type LedgerAsset = { kind: "player" | "pick" | "faab"; label: string; detail: string | null; value: number | null; position: string | null };
export type LedgerSide = { ownerId: string | null; rosterId: number | null; name: string; received: LedgerAsset[]; valueNow: number };
export type LedgerTrade = { id: string; season: string; week: number | null; createdAt: number; sides: LedgerSide[]; leader: string | null; margin: number };

export type ManagerProfile = {
  ownerId: string;
  rosterId: number | null;
  name: string;
  active: boolean;
  trades: number;
  tradesBySeason: Record<string, number>;
  partners: Record<string, number>;
  picksIn: number;
  picksOut: number;
  playersIn: number;
  playersOut: number;
  positionsIn: Record<string, number>;
  positionsOut: Record<string, number>;
  waiverAdds: number;
  faabSpent: number;
  /** Sum over trades of (today's value received − today's value sent). Hindsight only. */
  hindsightNet: number;
  /** Trades per season as a 0–1 league percentile. */
  activityPct: number;
};

export type SeasonSummary = {
  season: string;
  leagueId: string;
  champion: { ownerId: string | null; name: string } | null;
  runnerUp: { ownerId: string | null; name: string } | null;
  standings: { ownerId: string | null; name: string; wins: number; losses: number; ties: number; pf: number; place: number | null }[];
};

export type HistoryAnalysis = {
  seasons: SeasonSummary[];
  trades: LedgerTrade[];
  managers: ManagerProfile[];
  seasonsCovered: string[];
  /** Current roster id → activity percentile (0–1), used by the trade engine. */
  activityByRoster: Record<number, number>;
};

export type HistoryContext = {
  currentSeason: string;
  currentLeagueId: string;
  currentTransactions: Transaction[];
  /** Current teams: roster id ↔ owner and display name. */
  teams: { rosterId: number; ownerId: string | null; name: string }[];
  player: (id: string) => { name: string; position: string | null; value: number | null };
  /** Value of a not-yet-drafted pick, keyed by the pick's original owner. */
  futurePick: (season: string, round: number, originalOwnerId: string | null) => { label: string; value: number } | null;
};

/** Analyze multi-season league history. Every hindsight value uses today's values and says so. */
export function analyzeHistory(history: LeagueHistory, ctx: HistoryContext): HistoryAnalysis {
  const ownerToRoster = new Map(ctx.teams.filter((t) => t.ownerId).map((t) => [t.ownerId!, t.rosterId]));
  const currentName = new Map(ctx.teams.filter((t) => t.ownerId).map((t) => [t.ownerId!, t.name]));
  const pastName = new Map<string, string>();
  for (const s of history.seasons) for (const u of s.users) if (!pastName.has(u.user_id)) pastName.set(u.user_id, u.metadata?.team_name?.trim() || u.display_name);
  const nameOf = (owner: string | null) => (owner ? (currentName.get(owner) ?? pastName.get(owner) ?? "Former manager") : "Unowned team");

  const bySeason = new Map(history.seasons.map((s) => [s.season, s]));
  const currentOwnerOfRoster = new Map(ctx.teams.map((t) => [t.rosterId, t.ownerId]));
  const ownerIn = (season: HistoricalSeason | undefined, rosterId: number, fallbackCurrent: boolean) =>
    season?.rosterOwner[rosterId] ?? (fallbackCurrent ? (currentOwnerOfRoster.get(rosterId) ?? null) : null);

  // Resolve a pick to the player selected with it, when that draft is complete.
  const resolvePick = (pickSeason: string, round: number, originalRosterId: number): LedgerAsset => {
    const seasonData = bySeason.get(pickSeason);
    // Seasons without a league yet (future picks) resolve through today's roster owners.
    const origOwner = ownerIn(seasonData, originalRosterId, Number(pickSeason) >= Number(ctx.currentSeason));
    const draft = seasonData?.drafts.find((d) => d.season === pickSeason);
    const base = `${pickSeason} ${ordinal(round)}`;
    if (draft) {
      // Prefer the draft's slot → original roster map; fall back to the owner's draft_order slot.
      const bySlotMap = Object.entries(draft.slotToRoster ?? {}).find(([, rid]) => rid === originalRosterId)?.[0];
      const slot = bySlotMap != null ? Number(bySlotMap) : origOwner ? draft.draftOrder[origOwner] : undefined;
      const pick = draft.picks.find((p) => p.round === round && p.draft_slot === slot);
      if (pick?.player_id) {
        const pl = ctx.player(pick.player_id);
        return { kind: "pick", label: `${base} → ${pl.name}`, detail: `via ${nameOf(origOwner)}`, value: pl.value ?? 0, position: pl.position };
      }
    }
    const future = ctx.futurePick(pickSeason, round, origOwner);
    if (future) return { kind: "pick", label: `${base}`, detail: `${nameOf(origOwner)}'s pick`, value: future.value, position: null };
    return { kind: "pick", label: base, detail: `${nameOf(origOwner)}'s pick · value unknown`, value: null, position: null };
  };

  type TxWithSeason = { tx: Transaction; season: string; seasonData: HistoricalSeason | undefined; isCurrent: boolean };
  const all: TxWithSeason[] = [
    ...history.seasons.filter((s) => s.season !== ctx.currentSeason).flatMap((s) => s.transactions.map((tx) => ({ tx, season: s.season, seasonData: s, isCurrent: false }))),
    ...ctx.currentTransactions.filter((t) => t.status === "complete").map((tx) => ({ tx, season: ctx.currentSeason, seasonData: undefined, isCurrent: true })),
  ];

  const managers = new Map<string, ManagerProfile>();
  const profile = (owner: string): ManagerProfile => {
    let m = managers.get(owner);
    if (!m) {
      m = {
        ownerId: owner, rosterId: ownerToRoster.get(owner) ?? null, name: nameOf(owner), active: ownerToRoster.has(owner),
        trades: 0, tradesBySeason: {}, partners: {}, picksIn: 0, picksOut: 0, playersIn: 0, playersOut: 0, positionsIn: {}, positionsOut: {},
        waiverAdds: 0, faabSpent: 0, hindsightNet: 0, activityPct: 0,
      };
      managers.set(owner, m);
    }
    return m;
  };
  for (const t of ctx.teams) if (t.ownerId) profile(t.ownerId);

  const trades: LedgerTrade[] = [];
  for (const { tx, season, seasonData, isCurrent } of all) {
    const owner = (rid: number) => ownerIn(seasonData, rid, isCurrent);
    if (tx.type !== "trade") {
      if (tx.adds.length) {
        const o = owner(tx.rosterIds[0]);
        if (o) {
          const m = profile(o);
          m.waiverAdds += tx.adds.length;
          if (tx.type === "waiver" && tx.waiverBid) m.faabSpent += tx.waiverBid;
        }
      }
      continue;
    }
    const sides: LedgerSide[] = tx.rosterIds.map((rid) => {
      const o = owner(rid);
      const received: LedgerAsset[] = [
        ...tx.adds.filter((a) => a.rosterId === rid).map((a): LedgerAsset => {
          const p = ctx.player(a.playerId);
          return { kind: "player", label: p.name, detail: p.position, value: p.value ?? 0, position: p.position };
        }),
        ...tx.picks.filter((p) => p.toRosterId === rid).map((p) => resolvePick(p.season, p.round, p.originalRosterId)),
        ...tx.faab.filter((f) => f.to === rid).map((f): LedgerAsset => ({ kind: "faab", label: `$${f.amount} FAAB`, detail: null, value: null, position: null })),
      ];
      return { ownerId: o, rosterId: o ? (ownerToRoster.get(o) ?? null) : null, name: nameOf(o), received, valueNow: received.reduce((a, x) => a + (x.value ?? 0), 0) };
    });
    const sorted = [...sides].sort((a, b) => b.valueNow - a.valueNow);
    const margin = sides.length === 2 ? sorted[0].valueNow - sorted[1].valueNow : 0;
    trades.push({ id: tx.id, season, week: tx.week, createdAt: tx.createdAt, sides, leader: sides.length === 2 && margin > 0 ? sorted[0].ownerId : null, margin });

    const totalValue = sides.reduce((a, s) => a + s.valueNow, 0);
    for (const s of sides) {
      if (!s.ownerId) continue;
      const m = profile(s.ownerId);
      m.trades++;
      m.tradesBySeason[season] = (m.tradesBySeason[season] ?? 0) + 1;
      for (const other of sides) if (other.ownerId && other.ownerId !== s.ownerId) m.partners[other.ownerId] = (m.partners[other.ownerId] ?? 0) + 1;
      // Value received minus what the other side(s) received (for 2-team trades: exactly what was sent).
      m.hindsightNet += sides.length === 2 ? s.valueNow - (totalValue - s.valueNow) : 0;
      for (const a of s.received) {
        if (a.kind === "pick") m.picksIn++;
        if (a.kind === "player") {
          m.playersIn++;
          if (a.position) m.positionsIn[a.position] = (m.positionsIn[a.position] ?? 0) + 1;
        }
      }
      for (const other of sides) {
        if (other === s) continue;
        for (const a of other.received) {
          if (a.kind === "pick") m.picksOut++;
          if (a.kind === "player") {
            m.playersOut++;
            if (a.position) m.positionsOut[a.position] = (m.positionsOut[a.position] ?? 0) + 1;
          }
        }
      }
    }
  }
  trades.sort((a, b) => b.createdAt - a.createdAt);

  const seasonsCovered = [...new Set([...history.seasons.filter((s) => s.transactions.length || s.season !== ctx.currentSeason).map((s) => s.season), ctx.currentSeason])].sort();
  const nSeasons = Math.max(1, seasonsCovered.length);
  const active = [...managers.values()].filter((m) => m.active);
  const rates = active.map((m) => m.trades / nSeasons);
  for (const m of active) {
    const r = m.trades / nSeasons;
    m.activityPct = rates.length > 1 ? rates.filter((x) => x < r).length / (rates.length - 1) : 0.5;
  }

  const seasons: SeasonSummary[] = history.seasons
    .filter((s) => s.status === "complete")
    .map((s) => {
      const pts = (w: number | null | undefined, d: number | null | undefined) => (w ?? 0) + (d ?? 0) / 100;
      const standings = s.rosters
        .map((r) => ({
          ownerId: r.owner_id,
          name: nameOf(r.owner_id),
          wins: r.settings.wins,
          losses: r.settings.losses,
          ties: r.settings.ties,
          pf: Math.round(pts(r.settings.fpts, r.settings.fpts_decimal) * 100) / 100,
          place: s.placements[r.roster_id] ?? null,
        }))
        .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.wins - a.wins || b.pf - a.pf);
      const champ = standings.find((x) => x.place === 1);
      const runner = standings.find((x) => x.place === 2);
      return {
        season: s.season,
        leagueId: s.leagueId,
        champion: champ ? { ownerId: champ.ownerId, name: champ.name } : null,
        runnerUp: runner ? { ownerId: runner.ownerId, name: runner.name } : null,
        standings,
      };
    });

  return {
    seasons,
    trades,
    managers: [...managers.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.trades - a.trades),
    seasonsCovered,
    activityByRoster: Object.fromEntries(active.filter((m) => m.rosterId != null).map((m) => [m.rosterId!, m.activityPct])),
  };
}
