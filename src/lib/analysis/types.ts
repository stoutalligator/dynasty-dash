import type {
  DraftPick,
  InjuryInfo,
  Issue,
  LeagueInfo,
  RosterSlot,
  SkillPosition,
  SourceFreshness,
  Team,
  Transaction,
  Verification,
} from "@/lib/league/models";
import type { Strategy } from "@/lib/prefs/store";
import type { HistoryAnalysis } from "@/lib/history/analyze";
import type { SimSummary } from "@/lib/sim/context";
import type { BacktestReport } from "./backtest";
import type { ProviderStatus } from "@/lib/providers";

export type { Strategy };
export type Confidence = "high" | "medium" | "low";
export type ValueSource = "third-party" | "internal-estimate";

export type ProductionSummary = {
  /** Games played. */
  activeWeeks: number;
  total: number;
  ppg: number;
  adjPpg: number;
  last3Ppg: number | null;
  /** Offensive snap share 0–1 (NFL stats). */
  snapShare: number | null;
  snapShareLast3: number | null;
  snapTrend: number | null;
  /** Targets + carries per game (QBs: dropbacks + carries). */
  oppPerGame: number | null;
  oppLast3: number | null;
  weeksStarted: number;
  weeksBenched: number;
  benchPoints: number;
  weekly: { week: number; points: number; started: boolean | null; snapShare: number | null; opportunities: number | null; played: boolean }[];
  source: "stats" | "matchups";
};

export type PlayerView = {
  id: string;
  assetId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  age: number | null;
  yearsExp: number | null;
  injury: InjuryInfo | null;
  mapped: boolean;
  rosterId: number | null;
  slot: RosterSlot | null;
  starterSlot: string | null;
  /** Actual league production (Sleeper matchups, league scoring). */
  prod: ProductionSummary | null;
  /** Dynasty value on the active valuation scale; null when the source has no value for this player. */
  value: number | null;
  redraftValue: number | null;
  positionRank: number | null;
  valueSource: ValueSource;
  /** Adjusted PPG the team's best lineup would lose without this player. */
  lineupImpact: number;
  inBestLineup: boolean;
  /** Past the position's typical decline age (heuristic). */
  ageRisk: boolean;
  tags: string[];
  /** Sleeper projection (league scoring) for the current week. */
  projWeek: number | null;
  /** Sum of projections over the next three weeks. */
  projNext: number | null;
  /** Rest-of-season projection (current week through the championship week). */
  projRos: number | null;
  /** Sleeper-wide adds in the last 48 hours. */
  trendingAdds: number | null;
};

export type PickView = DraftPick & {
  assetId: string;
  label: string;
  value: number;
  /** How the value was determined; slot buckets for future seasons are estimates. */
  valueNote: string;
  valueSource: ValueSource;
};

export type Grade = { score: number; grade: string; rank: number };

export type PositionGrade = {
  position: SkillPosition;
  /** Adjusted PPG of this team's top-N players at the position (N = typical starters in this league). */
  starterPpg: number;
  starterRank: number;
  /** Adjusted PPG of the next players at the position (injury/bye contingency). */
  depthPpg: number;
  depthRank: number;
  value: number;
  valueRank: number;
  /** Composite of production rank (60%) and dynasty value rank (40%). */
  overall: Grade;
  playerIds: string[];
};

export type Need = { position: SkillPosition; severity: number; reason: string };

export type StrategyAssessment = {
  inferred: Strategy;
  confidence: Confidence;
  /** 0–1 composite of current strength. */
  nowScore: number;
  /** 0–1 composite of long-term assets. */
  futureScore: number;
  reasons: string[];
  override: Strategy | null;
  effective: Strategy;
};

export type TeamAnalysis = {
  team: Omit<Team, "roster">;
  players: PlayerView[];
  picks: PickView[];
  lineup: { assignments: { slot: string; playerId: string | null; score: number }[]; total: number; rank: number };
  injuryAdjustedLineupTotal: number;
  /** Best lineup by this week's projections (unavailable players excluded); null without projections. */
  projectedLineup: { week: number; assignments: { slot: string; playerId: string | null; score: number }[]; total: number; rank: number } | null;
  positions: Record<SkillPosition, PositionGrade>;
  depth: Grade;
  capital: Grade & { value: number; firsts: number; seconds: number; total: number };
  age: { valueWeighted: number | null; lineupAvg: number | null; ageRiskValueShare: number; youthRank: number };
  totals: { playerValue: number; pickValue: number; totalValue: number; valueRank: number };
  strengths: string[];
  weaknesses: string[];
  needs: Need[];
  surplusIds: string[];
  strategy: StrategyAssessment;
  powerRank: number;
  standingRank: number;
};

export type WeeklyTeamScore = {
  week: number;
  complete: boolean;
  median: number;
  teams: { rosterId: number; points: number; opponentRosterId: number | null; opponentPoints: number | null; won: boolean | null }[];
};

export type ValuationInfo = {
  label: string;
  kind: ValueSource;
  description: string;
  fetchedAt: string;
  status: ProviderStatus;
};

export type LeagueModel = {
  generatedAt: string;
  league: LeagueInfo;
  verification: Verification;
  freshness: Record<string, SourceFreshness>;
  issues: Issue[];
  myRosterId: number | null;
  teams: TeamAnalysis[];
  /** Roster ids ordered by record, then points for. */
  standings: number[];
  valuation: ValuationInfo;
  startersPerPosition: Record<SkillPosition, number>;
  replacementPpg: Record<SkillPosition, number>;
  freeAgents: PlayerView[];
  weekly: WeeklyTeamScore[];
  transactions: Transaction[];
  pickSeasons: string[];
  /** Names for any player id referenced in transactions. */
  playerNames: Record<string, { name: string; position: string | null; nflTeam: string | null }>;
  scoredWeeks: number;
  /** Where production numbers come from. */
  statsSource: "stats" | "matchups";
  /** Positions graded in this league (from its starting slots). */
  gradedPositions: string[];
  projectionWeeks: number[];
  trendingFetchedAt: string | null;
  history: HistoryAnalysis | null;
  /** Season simulation (playoff and title odds); null when it cannot run (e.g. offseason). */
  odds: SimSummary | null;
  /** Backtest of the current-strength signals on completed seasons. */
  modelCheck: BacktestReport | null;
};
