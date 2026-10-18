# Dynasty Edge

*Working name: Dynasty Dashboard.* A dynasty fantasy football analysis app for a Sleeper league. It pulls live league data from the public Sleeper API and does five things:

- **Maps every player in the NFL**, rostered or not, and scores their real weekly stats with your league's own scoring settings.
- **Analyzes all twelve teams** and classifies each one's competitive window.
- **Finds sleepers on the waiver wire.**
- **Studies three seasons of league history**, including every trade and draft.
- **Suggests realistic two- and three-team trades**, with the reasoning shown.

It is built for one league (Monson Dynasty Squad), but nothing is hardcoded to it. Point `SLEEPER_LEAGUE_ID` at another Sleeper league and the format, scoring, roster slots, baselines and history all come from that league's live data.

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # league id + your roster are pre-filled
npm run league-audit          # fetch + map the league, write data/league-audit.json
npm run dev                   # http://localhost:3000
```

No Sleeper account, API key, database or paid service is needed. The first page load downloads the player database, this season's weekly stats and prior seasons' history (about 10–15 s). Later loads come from the cache.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SLEEPER_LEAGUE_ID` | required | Public Sleeper league id (not a secret). |
| `MY_ROSTER_ID` | — | Your roster id. Verified against the live league; a mismatch is reported, never assumed. |
| `EXPECTED_TEAM_NAME` | — | Cross-check for your team name (also used to find your roster if no id is set). |
| `VALUATION_PROVIDER` | `fantasycalc` | `fantasycalc` (free third-party dynasty values) or `none` (internal estimate only). |
| `FUTURE_PICK_SEASONS` | `3` | How many upcoming rookie drafts to show pick ownership for. |
| `CACHE_DIR` | `.cache` | Where JSON caches are written (gitignored). |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` structured JSON logs. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. |
| `npm run build && npm start` | Production build / server. |
| `npm run league-audit` | League audit → `data/league-audit.json` (league metadata, managers, rosters with mapped players, pick ownership, freshness, issues). `-- --refresh` refetches league data; `-- --refresh-all` also re-downloads the player database. |
| `npm run inspect` | One-screen summary of the analysis model: grades, strategies, lineups, free-agent pool and history. |
| `npm test` | Vitest unit + integration tests. |
| `npm run typecheck` / `npm run lint` | Strict TypeScript / ESLint. |

## Data and freshness

Sleeper is the source of truth for league settings, rosters, ownership, matchups, transactions and drafts. All external calls run on the server.

| Source | Endpoint | Cache |
|---|---|---|
| League settings | `/league/{id}` | 15 min |
| Managers | `/league/{id}/users` | 1 h |
| Rosters & standings | `/league/{id}/rosters` | 10 min |
| Traded picks | `/league/{id}/traded_picks` | 30 min |
| Drafts, draft slots & picks | `/league/{id}/drafts`, `/draft/{id}`, `/draft/{id}/picks` | 6 h / 7 days |
| Transactions | `/league/{id}/transactions/{week}` | 10 min (current week) |
| Matchups | `/league/{id}/matchups/{week}` | 10 min current / 24 h completed |
| NFL players (~15 MB) | `/players/nfl` | 24 h (raw copy kept in `.cache/raw/`) |
| Weekly NFL stats, all players | `/stats/nfl/regular/{season}/{week}` ¹ | 1 h latest week / 24 h older |
| Weekly projections | `/projections/nfl/regular/{season}/{week}` ¹ | 6 h (current + next two weeks) |
| Trending adds/drops | `/players/nfl/trending/{add,drop}` | 30 min |
| Past seasons | `previous_league_id` chain + `/league/{id}/winners_bracket` | 7 days (completed seasons) |
| Dynasty values | FantasyCalc `values/current` | 12 h |

¹ Public but undocumented Sleeper endpoints. Scoring their raw stats with this league's settings reproduces Sleeper's own matchup points exactly (verified: 0 mismatches across all rostered players). If either feed is unavailable, production falls back to league matchups (rostered players only) and the app says so.

- **Automatic updates.** Every page load rebuilds the analysis from the cached data, so trades and pickups appear once their cache window passes.
- **Manual refresh.** The header's **Refresh** button pulls league data, stats and trends immediately. **Settings → Refresh all** also re-downloads the player database, valuations and history.
- **Failure handling.** Responses are validated with Zod before they are cached. Failed requests are retried on 429/5xx with backoff. If a refresh fails, the last good copy is served and flagged as stale. Data is never fabricated.
- **Issue reporting.** Problems are listed on **Settings → Data issues**.

## What's in the app

| Page | Highlights |
|---|---|
| **Dashboard** | Record and standing, team outlook with reasons, recommended next actions, best trade opportunities, top waiver adds, positional grades, league strategy distribution, injuries, draft capital, recent activity. |
| **My Team** | Roster grouped by starter/bench/taxi/IR: production, snap share, this week's projection, value, lineup impact. Strategy panel with override; best lineup and projected lineup for this week; needs/surplus; picks; recommendations for **Contend now / Retool / Rebuild**. |
| **League** | Standings, power rankings, team profiles (every team gets the same analysis page), opportunities, activity feed, settings and scoring. |
| **Players** | Every rostered player plus every free agent with production, a projection, a dynasty value or add activity; search and filters. |
| **Waiver Wire** | Every unrostered QB/RB/WR/TE ranked by a transparent pickup score. Tiers (Strong add / Worth a look / Stash / Monitor), reasons, weekly sparkbars, best fits for your roster, drop candidates, FAAB remaining, trending-and-available, recently dropped. |
| **Trade Hub** | Two-team engine (objective, partner, position, age, package size and pick controls; untouchable / trade-block / target flags; two-sided breakdowns; builder; compare up to three; saved proposals re-checked against current rosters) and an exploratory **three-team** search. |
| **Draft Picks** | Ownership matrix by team × season × round, traded-pick list, estimated values. |
| **Analytics** | Weekly score vs. league median, age vs. asset value, lineup efficiency, positional heatmap, weekly scores, production left on benches. |
| **History** | Champions and final standings for every season, manager trading profiles, trade ledger valued with hindsight (traded picks resolved to the players drafted with them), and a who-trades-with-whom matrix. |
| **Settings** | Config verification, per-source freshness, refresh, valuation provider status, strategy overrides for every team, data issues. |

The UI is dark-themed and responsive. Every page has been checked at a 390 px phone width with no horizontal scrolling: wide tables become compact lists and the sidebar becomes a drawer.

## How the analysis works

Every number is either actual data (Sleeper), third-party data (labeled with its source), or our own estimate (labeled). The heuristics are simple and testable.

### Rosters and teams

- **Production.** Each player's raw weekly NFL stats are scored with the league's settings (completed weeks only).
  - Games come from games played, so byes and injuries don't drag averages down.
  - *Adjusted PPG* divides by at least 2 games so tiny samples don't dominate.
  - Snap share, targets plus carries per game, and their recent trend come from the same stats.
  - Started/benched usage comes from league matchups.
- **Best lineup.** Fills the league's real starting slots from starters and bench (taxi and IR can't start), most restrictive slot first. *Lineup impact* is the adjusted PPG lost without a player. The **projected lineup** does the same with Sleeper's projections for this week, excluding players listed Out or IR.
- **Positional grades.** 60% production rank of a team's top-N at the position, where N is how many that position the league's best lineups actually start (2 QBs here because of superflex), plus 40% dynasty-value rank.
- **Strategy (Contender / Retool / Rebuilder).**
  - *Current strength:* best-lineup PPG 45%, points for 20%, potential points 15%, win % 20%. At 62 or above a team is a contender; at 38 or below it is rebuilding.
  - *Future score:* youth, young-player value and draft capital.
  - *Confidence* reflects distance from the thresholds.
  - These are estimates of a team's position, not of a manager's intent, and every team can be overridden.
- **Pick ownership.** `traded_picks` lists only picks that moved; all others are *implied* to belong to their original team. The nearest draft's slot (early/mid/late) is estimated from the original team's power rank.

### Waiver wire

**Pickup score (0–100)** is a weighted blend anchored to league benchmarks, not to other free agents:

| Component | Weight | Measures |
|---|---|---|
| Production | 35% | Recent PPG vs. the league's replacement level at the position; samples under 2 games count less |
| Opportunity | 20% | Snap share, plus targets and carries vs. a full workload (QB 35, RB 16, WR 8, TE 6 per game) |
| Projection | 20% | This week's Sleeper projection vs. replacement level |
| Trend | 5% | Snap-share trend |
| Upside | 10% | Dynasty value, or age 24 or under with 2 or fewer years of experience |
| Market | 10% | Sleeper adds in the last 48 hours |

- *Strong add:* 60 or above, producing at replacement level, and available.
- *Worth a look:* 45 or above.
- *Stash:* young or valued upside.
- *Fit with your team:* lineup gain is the adjusted PPG your best lineup would add.

### Trades

1. **Candidates.** Packages of 1–3 assets per side whose depth-discounted values are within ±25% of each other (each extra asset counts ×0.85 of the previous).
2. **Strategy lens.** Each side is scored through its own strategy. Rebuilders weight picks and players 25 or younger ×1.15 and aging veterans ×0.75; contenders weight picks ×0.85.
3. **Other inputs.** Lineup change, needs addressed, and the *value of the players a team would have to cut* to stay within its roster limit.
4. **Ranking.** Rewards mutual benefit, penalizes deals the partner has little reason to consider, and gives a small boost to managers who trade often (from league history). No single outgoing asset leads more than three proposals.
5. **Three-team (exploratory).** One-for-one-for-one cycles (you → B, B → C, C → you), only where B and C plausibly want what they receive (a need, or a fit with their window) and all three sides score acceptably.
6. **Limits.** It never claims a trade will be accepted.

### History

- **Seasons.** The app walks `previous_league_id` back through earlier seasons (2024 and 2025 here). Finishes come from the winners bracket.
- **Manager identity.** Managers are matched across seasons by Sleeper user id, so a team keeps its history through name changes. Departed managers keep their old names.
- **Traded picks.** Picks from completed drafts resolve to the drafted player through the draft's slot-to-roster map. Future picks use current pick values.
- **Hindsight.** Values use today's numbers and ignore points already scored. They are labeled as a rough signal, not a verdict.

### Fallback valuation

With `VALUATION_PROVIDER=none` (or if FantasyCalc is unreachable), values come from production above each position's replacement level times a position age curve, labeled as approximations.

## Architecture

```
src/
  app/                    Pages (App Router), server actions (actions.ts), error / not-found
  components/             UI: shell, team, trades (incl. three-team), waivers, history, league, charts, primitives
  lib/
    config.ts             Zod-validated environment config
    cache/file-cache.ts   JSON-on-disk cache: TTLs, stale fallback, in-flight de-dupe
    sleeper/              HTTP client (timeouts, retries, validation), schemas, endpoints
    players/              Player DB normalization + roster/manager mapping (shared by script and site)
    league/               Domain models, snapshot loader, pick ownership, audit report
    stats/                League scoring of raw stats, weekly stats / projections / trending loaders
    history/              Previous-league chain loader, multi-season analysis (ledger, profiles, champions)
    analysis/             Production, lineup optimizer, grades, strategy, model builder, recommendations, waivers
    trades/               Assets, trade evaluation, two-team generation, three-team cycles
    providers/            Valuation provider interface, FantasyCalc, internal estimate
    prefs/store.ts        Local JSON preferences (overrides, flags, saved proposals)
    server/               Request-time data access for Server Components
  scripts/                map-players.ts (league audit), inspect-model.ts
tests/                    Vitest: mapping, picks, lineup/strategy, model + trades, stats/waivers, history/three-team, HTTP/cache
```

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, Zod 4, Recharts 3, Vitest. Pages stream live data inside `<Suspense>` after `connection()`, so league data is never baked into a static build.

Persistence is a gitignored local JSON file (`data/user-prefs.json`). That is fine for a personal tool. Before deploying to a read-only or serverless host, swap `lib/prefs/store.ts` and the file cache for a database or KV store.

## Known limitations

- **Undocumented feeds.** Weekly stats and projections come from undocumented Sleeper endpoints. They are validated and have a fallback, but could change without notice.
- **Projections.** Projections are Sleeper's (current week plus the next two). No rest-of-season projection source is integrated yet.
- **Unscored slots.** K / DEF / IDP slots are filled if present but not graded, and the waiver wire covers QB/RB/WR/TE.
- **Three-team scope.** Three-team search covers one-for-one-for-one cycles only.
- **FantasyCalc.** The endpoint is public but undocumented. It is optional and falls back to the internal estimate.
- **Not integrated.** ESPN/Yahoo data is not integrated. Their APIs don't expose private league data publicly.
