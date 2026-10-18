/**
 * External valuation / projection providers. The analysis engine depends only on these types,
 * so additional sources can be added without touching it.
 */

export type PlayerValuation = {
  /** Dynasty trade value on the provider's scale. */
  value: number;
  /** Rest-of-season / redraft value when the provider offers one. */
  redraftValue: number | null;
  overallRank: number | null;
  positionRank: number | null;
  trend30Day: number | null;
};

export type PickValuation = {
  season: string;
  round: number;
  /** null = generic pick for that round (slot unknown). */
  bucket: "early" | "mid" | "late" | null;
  value: number;
};

export type ValuationSet = {
  providerId: string;
  label: string;
  /** What the numbers mean, shown in the UI next to every value. */
  description: string;
  /** Whether values come from a third party (vs. this app's own estimate). */
  kind: "third-party" | "internal-estimate";
  fetchedAt: string;
  /** Format the values were requested for, so mismatches are visible. */
  format: { superflex: boolean; receptionPoints: number; teams: number };
  /** Keyed by Sleeper player id. */
  players: Record<string, PlayerValuation>;
  picks: PickValuation[];
  /** Display names for players the provider values but who are not in the league (e.g. free agents). */
  names?: Record<string, string>;
};

export type ProviderContext = { superflex: boolean; receptionPoints: number; teams: number };

export interface ValuationProvider {
  id: string;
  label: string;
  fetch(ctx: ProviderContext): Promise<Omit<ValuationSet, "fetchedAt">>;
}
