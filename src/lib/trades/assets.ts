import type { LeagueModel, PickView, PlayerView, TeamAnalysis } from "@/lib/analysis/types";

export type TradeAsset = {
  assetId: string;
  kind: "player" | "pick";
  label: string;
  detail: string;
  rosterId: number;
  value: number;
  position: string | null;
  age: number | null;
  adjPpg: number | null;
  /** Taxi/reserve players cannot be started; they still count as assets. */
  slot: string | null;
  /** Past the position's typical decline age. */
  ageRisk: boolean;
};

export function playerAsset(p: PlayerView): TradeAsset {
  return {
    assetId: p.assetId,
    kind: "player",
    label: p.name,
    detail: [p.position, p.nflTeam ?? "FA", p.age != null ? `${Math.floor(p.age)}y` : null].filter(Boolean).join(" · "),
    rosterId: p.rosterId ?? -1,
    value: p.value ?? 0,
    position: p.position,
    age: p.age,
    adjPpg: p.prod?.adjPpg ?? null,
    slot: p.slot,
    ageRisk: p.ageRisk,
  };
}

export function pickAsset(p: PickView): TradeAsset {
  return {
    assetId: p.assetId,
    kind: "pick",
    label: p.label,
    detail: p.source === "implied" ? "Own pick (implied)" : "Acquired via trade",
    rosterId: p.ownerRosterId,
    value: p.value,
    position: null,
    age: null,
    adjPpg: null,
    slot: null,
    ageRisk: false,
  };
}

export function teamAssets(t: TeamAnalysis): TradeAsset[] {
  return [...t.players.map(playerAsset), ...t.picks.map(pickAsset)];
}

export function assetIndex(model: LeagueModel): Map<string, TradeAsset> {
  return new Map(model.teams.flatMap(teamAssets).map((a) => [a.assetId, a]));
}

/**
 * Package value with a depth discount: the best asset counts fully and each additional asset
 * counts 85% of the previous multiplier, so two mid pieces don't automatically equal one star.
 */
export function packageValue(values: number[]): number {
  return Math.round([...values].sort((a, b) => b - a).reduce((acc, v, i) => acc + v * 0.85 ** i, 0));
}
