# Dynasty Edge

*Working name: Dynasty Dashboard.* A dynasty fantasy football analysis app for a Sleeper league. It pulls live league data from the public Sleeper API and does five things:

- **Maps every player in the NFL**, rostered or not, and scores their real weekly stats with your league's own scoring settings.
- **Analyzes all twelve teams** and classifies each one's competitive window.
- **Finds sleepers on the waiver wire.**
- **Studies three seasons of league history**, including every trade and draft.
- **Suggests realistic two- and three-team trades**, with the reasoning shown.
- **Simulates the rest of the season** to estimate every team's playoff and title odds, and shows how each trade would change yours.
- **Sends a weekly digest** to Discord, Slack or your phone.

On first visit you choose a league: enter your Sleeper username and pick from your leagues, or paste any league ID. Your team is recognised from your Sleeper account. You can switch between leagues at any time from the sidebar, and each league keeps its own preferences, saved trades and digest. Nothing is hardcoded to one league: format, scoring, roster slots, baselines and history all come from the chosen league's live data.

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # optional defaults; the league is chosen in the app
npm run league-audit          # fetch + map the league, write data/league-audit.json
npm run dev                   # http://localhost:3000 → choose your league
```

No Sleeper account, API key, database or paid service is needed locally: data is cached in `.cache/` and preferences in `data/`. The first page load downloads the player database, this season's weekly stats and projections, and prior seasons' history (about 10–20 s). Later loads come from the cache.

## Deploying to Vercel

1. **Create a database for this app.** Create a new Neon project, or at least a separate database. Don't reuse another app's production database. The easiest route is Vercel → your project → **Storage → Create Database → Neon**, which provisions it and sets `DATABASE_URL` for you.
2. **Import the repo** in Vercel (framework: Next.js; defaults are fine). Put the functions in the same region as the database if you can.
3. **Set environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `APP_PASSWORD` | A password for the site (8+ characters). Without it the site is public. |
   | `CRON_SECRET` | A long random string. Vercel Cron sends it automatically. |
   | `DATABASE_URL` | Set by the Neon integration. |
   | `DIGEST_WEBHOOK_URL` *(optional)* | Discord or Slack incoming-webhook URL for the weekly digest. |
   | `NTFY_TOPIC` *(optional)* | An unguessable ntfy.sh topic for phone push notifications. |

4. **Deploy.** The table is created on first use. To check it from your machine, put the same `DATABASE_URL` in `.env` and run `npm run db:setup`.
5. **Open the site and choose your league** (Sleeper username → pick the league). The choice is saved in the database.
6. **Warm the cache** once, so the next visit is fast:
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/cron/refresh`

Scheduled jobs come from `vercel.json` (times are UTC):

| Job | Schedule | What it does |
|---|---|---|
| Refresh | daily 11:00 | Refreshes all data and pre-builds trade ideas |
| Digest | Tuesday 15:00 | Builds the weekly digest and sends it |

Vercel's Hobby plan runs each job at most once a day, which is all these need.

What happens on Vercel without a database: the app still works using temporary storage. Preferences, saved trades and digests won't persist, and the app warns about it.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SLEEPER_LEAGUE_ID` | — | Optional default league, used only until a league is chosen in the app (`/setup`). |
| `MY_ROSTER_ID` / `EXPECTED_TEAM_NAME` | — | Optional: identify your team in that default league. With in-app setup your team comes from your Sleeper account instead. |
| `VALUATION_PROVIDER` | `fantasycalc` | `fantasycalc` (free third-party dynasty values) or `none` (internal estimate only). |
| `FUTURE_PICK_SEASONS` | `3` | How many upcoming rookie drafts to show pick ownership for. |
| `SIM_RUNS` | `10000` | Simulated seasons for playoff/title odds. Each trade proposal uses 3,000 runs. |
| `STORAGE` | `auto` | `auto` picks Postgres if `DATABASE_URL` is set, else Upstash if configured, else files. Can be forced: `file`, `postgres` or `upstash`. |
| `DATABASE_URL` | — | Neon/Postgres connection string (`POSTGRES_URL` is also accepted). |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | — | Optional Redis alternative (`KV_REST_API_*` also accepted). |
| `CACHE_DIR` / `DATA_DIR` | `.cache` / `data` | Local file storage when no database is configured (gitignored). |
| `APP_PASSWORD` | — | Site password. Leave empty locally. |
| `AUTH_SECRET` | derived | Signs session cookies. |
| `CRON_SECRET` | — | Bearer secret required by `/api/cron/*`. |
| `DIGEST_WEBHOOK_URL` / `NTFY_TOPIC` | — | Digest delivery: Discord or Slack webhook, and/or ntfy push. |
| `APP_URL` | Vercel URL | Base URL for links in the digest. |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` structured JSON logs. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. |
| `npm run build && npm start` | Production build / server. |
| `npm run league-audit` | Audit of the active league (in-app choice, else env default) → `data/league-audit.json` (league metadata, managers, rosters with mapped players, pick ownership, freshness, issues). `-- --refresh` refetches league data; `-- --refresh-all` also re-downloads the player database. |
| `npm run db:setup` | Checks the configured storage and creates the Postgres table. |
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
| Weekly projections | `/projections/nfl/regular/{season}/{week}` ¹ | 6 h upcoming / 7 days past (week 1 through the championship) |
| Remaining schedule | `/league/{id}/matchups/{week}` (future weeks) | 24 h |
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
| **Analytics** | Weekly score vs. league median, age vs. asset value, lineup efficiency, positional heatmap, weekly scores, production left on benches, and a **model check** against past seasons. |
| **History** | Champions and final standings for every season, manager trading profiles, trade ledger valued with hindsight (traded picks resolved to the players drafted with them), and a who-trades-with-whom matrix. |
| **Digest** | The latest weekly digest, previous weeks, and "build / send now" buttons. |
| **Choose league** (`/setup`) | Find your leagues by Sleeper username (dynasty first), or open any league by ID and pick your team (or view only). Recent leagues are one tap away; the sidebar's league chip opens it. |
| **Settings** | Config verification, storage / sign-in / cron / digest status, per-source freshness, refresh, valuation provider, appearance, strategy overrides for every team, data issues, sign out. |

**Also throughout the app:**

- **Odds:** team pages and the Dashboard show playoff and title odds, the League page has a **Playoff odds** tab, and every trade proposal shows how your odds change (title X% → Y%, playoffs X% → Y%).
- **Player details:** tap any player name for a drawer with their game log (points, snap share, targets/carries, started or benched), projections, value and status.
- **Theme:** a System / Light / Dark switch in the sidebar.
- **Kickers and defenses** are graded automatically in leagues that start them.

The UI is dark-themed and responsive. Every page has been checked at a 390 px phone width with no horizontal scrolling: wide tables become compact lists and the sidebar becomes a drawer.

## How the analysis works

Every number is either actual data (Sleeper), third-party data (labeled with its source), or our own estimate (labeled). The heuristics are simple and testable.

### Leagues and your team

- **Choosing a league.** The choice is stored server-side (with a recent-leagues list), so scheduled jobs use it too.
- **Your team.** Recognised from your Sleeper account (owner or co-owner). If you set up by league ID, it's the team you picked. If your account isn't in a league, team-specific views are hidden and the league-wide analysis still works.
- **Per-league data.** Preferences, overrides, saved trades and digests are stored per league.
- **Redraft leagues.** Redraft and keeper leagues use FantasyCalc's redraft values; dynasty leagues use dynasty values.

### Rosters and teams

- **Production.** Each player's raw weekly NFL stats are scored with the league's settings (completed weeks only).
  - Games come from games played, so byes and injuries don't drag averages down.
  - *Adjusted PPG* divides by at least 2 games so tiny samples don't dominate.
  - Snap share, targets plus carries per game, and their recent trend come from the same stats.
  - Started/benched usage comes from league matchups.
- **Best lineup.** Fills the league's real starting slots from starters and bench (taxi and IR can't start), most restrictive slot first. *Lineup impact* is the adjusted PPG lost without a player. The **projected lineup** does the same with Sleeper's projections for this week, excluding players listed Out or IR.
- **Positional grades.** 60% production rank of a team's top-N at the position, where N is how many that position the league's best lineups actually start (2 QBs here because of superflex), plus 40% dynasty-value rank.
- **Strategy (Contender / Retool / Rebuilder).**
  - *Current strength:* best-lineup PPG 35%, points for 30%, win % 25%, potential points 10%. At 62 or above a team is a contender; at 38 or below it is rebuilding. These weights were calibrated with the model check (below).
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

### Season simulation (playoff and title odds)

- **Weekly team scores.** Each team's expected score is its best lineup by Sleeper's projections for that week. For the current week, players listed Out/IR are excluded.
- **Calibration.** Projections are scaled to this league's actual scoring so far (projected vs. actual lineups in completed weeks; currently ×1.03).
- **Variance.** Weekly scores are drawn from a normal distribution whose spread is the within-team standard deviation of every weekly score in this league's history (currently about 25 points).
- **Schedule.** The real remaining pairings come from Sleeper, plus the league-median game when enabled.
- **Seeding.** Division winners take the top seeds, then the best records (wins, then points for).
- **Playoffs.** Byes go to the top seeds, and each round pairs the highest remaining seed with the lowest.
- **Trades.** The same random draws are reused for the baseline and the "what if" roster, so odds changes reflect the trade and not noise. Title-odds change also feeds trade ranking for contending (0.25 per point) and retooling (0.10) objectives.
- **Assumptions** are listed under the odds table. Rosters are held fixed, and Sleeper's exact bracket and tiebreakers may differ.

### Model check (backtest)

Analytics replays 2024 and 2025 from the same point in the season (week 4–8). For each early signal (record, points for, lineup potential, and the app's blend) it reports the Spearman correlation with the final regular-season standings, and how many eventual playoff teams it had in its top group.

In this league, points for and record after week 6 predicted the final order better than lineup potential alone (ρ ≈ 0.90 vs 0.76). So the strategy blend was shifted from 45/20/15/20 to 35/30/25/10, which raised its correlation from 0.83 to 0.87. With only two seasons, the weights were nudged rather than fitted.

### Weekly digest

The digest is built from the same model and compared with the previous digest. It covers:

- record and odds, with the change since last week
- the best waiver fits and FAAB left
- your injuries, with new ones flagged
- the top three trade ideas with their odds change
- teams whose buy/sell posture changed
- the trade-deadline countdown and title favorites

It is stored in the database and posted to Discord/Slack (`DIGEST_WEBHOOK_URL`) and/or ntfy (`NTFY_TOPIC`).

### Fallback valuation

With `VALUATION_PROVIDER=none` (or if FantasyCalc is unreachable), values come from production above each position's replacement level times a position age curve, labeled as approximations.

## Architecture

```
src/
  proxy.ts                Password gate (signed session cookie; cron routes use CRON_SECRET)
  app/                    (dashboard)/ pages with the app shell, login/, api/cron/{refresh,digest}, server actions
  components/             UI: shell, team, trades (incl. three-team), waivers, history, league, charts, primitives
  lib/
    config.ts             Zod-validated environment config
    store/                Key/value storage: local files, Neon Postgres (one gzip-compressed table), Upstash Redis
    cache/file-cache.ts   Read-through data cache over the store: TTLs, stale fallback, in-flight de-dupe
    auth.ts               Session tokens (Web Crypto HMAC), password and cron checks
    sim/                  Season Monte Carlo (seeded, common random numbers) and odds-for-trades
    digest/               Weekly digest builder, storage and delivery (Discord/Slack/ntfy)
    sleeper/              HTTP client (timeouts, retries, validation), schemas, endpoints
    players/              Player DB normalization + roster/manager mapping (shared by script and site)
    league/               Domain models, snapshot loader, pick ownership, audit report
    stats/                League scoring of raw stats, weekly stats / projections / trending loaders
    history/              Previous-league chain loader, multi-season analysis (ledger, profiles, champions)
    analysis/             Production, lineup optimizer, grades, strategy, model builder, recommendations, waivers, backtest
    trades/               Assets, trade evaluation, two-team generation, three-team cycles
    providers/            Valuation provider interface, FantasyCalc, internal estimate
    prefs/store.ts        Local JSON preferences (overrides, flags, saved proposals)
    server/               Request-time data access for Server Components
  scripts/                map-players.ts (league audit), inspect-model.ts
tests/                    Vitest: mapping, picks, lineup/strategy, model + trades, stats/waivers, history/three-team, HTTP/cache
```

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, Zod 4, Recharts 3, Vitest. Pages stream live data inside `<Suspense>` after `connection()`, so league data is never baked into a static build.

Persistence goes through `lib/store`. Locally that's gitignored files; on Vercel it's Neon Postgres. Cached API data and user data (preferences, saved trades, digests) share one small table, stored under separate namespaces.

## Known limitations

- **Undocumented feeds.** Weekly stats and projections come from undocumented Sleeper endpoints. They are validated and have a fallback, but could change without notice.
- **Projections.** Projections are Sleeper's. The season simulation assumes today's rosters for the rest of the season.
- **IDP.** Individual defensive player (IDP) slots are filled if present but not graded. K and DEF are graded only in leagues that start them.
- **Three-team scope.** Three-team search covers one-for-one-for-one cycles only.
- **FantasyCalc.** The endpoint is public but undocumented. It is optional and falls back to the internal estimate.
- **Not integrated.** ESPN/Yahoo data is not integrated. Their APIs don't expose private league data publicly.
