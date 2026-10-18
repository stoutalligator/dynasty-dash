/** Normalized internal models. Everything here is derived from Sleeper data, never invented. */

export type RosterSlot = "starter" | "bench" | "taxi" | "reserve";

export const SKILL_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type SkillPosition = (typeof SKILL_POSITIONS)[number];

export type InjuryInfo = {
  status: string;
  bodyPart: string | null;
  notes: string | null;
  practice: string | null;
};

export type PlayerInfo = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  fantasyPositions: string[];
  nflTeam: string | null;
  /** Fractional age from birth date when available, otherwise Sleeper's integer age. */
  age: number | null;
  yearsExp: number | null;
  status: string | null;
  active: boolean | null;
  injury: InjuryInfo | null;
  depthChartOrder: number | null;
  newsUpdated: number | null;
  /** False when the id was not found in the Sleeper player database. */
  mapped: boolean;
};

export type PlayerDb = Record<string, PlayerInfo>;

export type RosteredPlayer = {
  player: PlayerInfo;
  slot: RosterSlot;
  /** Lineup slot label (e.g. "SUPER_FLEX") when the player is a current starter. */
  starterSlot: string | null;
};

export type Manager = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Team = {
  rosterId: number;
  ownerId: string | null;
  manager: Manager | null;
  coOwners: Manager[];
  teamName: string;
  avatarUrl: string | null;
  division: number | null;
  divisionName: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Sleeper "ppts" (max possible points); null when the API does not provide it. */
  potentialPoints: number | null;
  streak: string | null;
  recentResults: string | null;
  waiverPosition: number | null;
  faabUsed: number | null;
  roster: RosteredPlayer[];
  isMine: boolean;
};

export type LeagueFormat = {
  superflex: boolean;
  qbStartSlots: number;
  receptionPoints: number;
  tePremium: number;
  scoringLabel: string;
};

export type LeagueInfo = {
  id: string;
  name: string;
  season: string;
  status: string;
  seasonType: string | null;
  totalRosters: number;
  avatarUrl: string | null;
  rosterPositions: string[];
  startingSlots: string[];
  benchSlots: number;
  taxiSlots: number;
  reserveSlots: number;
  draftRounds: number | null;
  playoffTeams: number | null;
  playoffWeekStart: number | null;
  tradeDeadline: number | null;
  /** FAAB budget per team (0/null when the league does not use FAAB). */
  waiverBudget: number | null;
  /** Sleeper waiver_type: 0 rolling, 1 reverse standings, 2 FAAB. */
  waiverType: number | null;
  /** Current league week (Sleeper "leg"). */
  currentWeek: number | null;
  lastScoredWeek: number | null;
  divisions: { id: number; name: string; avatarUrl: string | null }[];
  format: LeagueFormat;
  scoringSettings: Record<string, number>;
  previousLeagueId: string | null;
  draftId: string | null;
};

export type DraftPick = {
  season: string;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
  previousOwnerRosterId: number | null;
  /** "traded_picks" = confirmed by Sleeper; "implied" = untraded, so held by the original team. */
  source: "traded_picks" | "implied";
  /** Draft slot when Sleeper has published a draft order for that season. */
  slot: number | null;
};

export type TxPlayerMove = { playerId: string; rosterId: number };
export type TxPickMove = { season: string; round: number; originalRosterId: number; fromRosterId: number | null; toRosterId: number };

export type Transaction = {
  id: string;
  type: string;
  status: string;
  createdAt: number;
  week: number | null;
  rosterIds: number[];
  adds: TxPlayerMove[];
  drops: TxPlayerMove[];
  picks: TxPickMove[];
  faab: { from: number; to: number; amount: number }[];
  waiverBid: number | null;
};

export type MatchupEntry = {
  rosterId: number;
  matchupId: number | null;
  points: number;
  starters: string[];
  startersPoints: number[];
  playersPoints: Record<string, number>;
};

/** `complete` is false for the in-progress week (partial live scores). */
export type WeekResult = { week: number; complete: boolean; entries: MatchupEntry[] };

export type IssueLevel = "error" | "warning" | "info";
export type Issue = { level: IssueLevel; code: string; message: string; context?: Record<string, unknown> };

export type SourceFreshness = {
  fetchedAt: string;
  source: "network" | "cache" | "stale-cache";
  stale: boolean;
  error?: string;
};

export type Verification = {
  configuredLeagueId: string;
  leagueFound: boolean;
  expectedRosterId: number | null;
  expectedTeamName: string | null;
  /** Roster resolved for "my team", or null if it could not be verified. */
  myRosterId: number | null;
  myTeamName: string | null;
  notes: string[];
};

export type LeagueSnapshot = {
  generatedAt: string;
  league: LeagueInfo;
  teams: Team[];
  picks: DraftPick[];
  pickSeasons: string[];
  transactions: Transaction[];
  weeks: WeekResult[];
  players: PlayerDb;
  freshness: Record<string, SourceFreshness>;
  issues: Issue[];
  verification: Verification;
};
