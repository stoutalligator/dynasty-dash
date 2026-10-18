import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { PageSkeleton } from "@/components/page-skeleton";
import { RefreshButton } from "@/components/shell/refresh-button";
import { StrategyOverride } from "@/components/team/strategy-override";
import { Card, CardHeader, Notice, PageTitle, SourceTag, StrategyBadge } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { getLeague } from "@/lib/server/data";
import { getConfig } from "@/lib/config";
import { authEnabled } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

const SOURCE_LABEL: Record<string, string> = {
  league: "League settings",
  users: "Managers",
  rosters: "Rosters & standings",
  tradedPicks: "Traded picks",
  drafts: "Drafts",
  players: "NFL player database",
  transactions: "Transactions",
  matchups: "Matchups & scoring",
  stats: "NFL weekly stats (all players)",
  projections: "Sleeper projections",
};

async function SettingsContent() {
  const { model } = await getLeague();
  const cfg = getConfig();
  const v = model.verification;
  const val = model.valuation;
  return (
    <>
      <PageTitle title="Settings & data" subtitle="Configuration, data freshness, valuation source, and strategy overrides" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="League configuration" subtitle="Set in .env; verified against the live Sleeper API" />
          <dl className="divide-y divide-line/60 px-4 pb-3 text-sm">
            {[
              ["SLEEPER_LEAGUE_ID", v.configuredLeagueId],
              ["League found", v.leagueFound ? `Yes · ${model.league.name}` : "No"],
              ["MY_ROSTER_ID", v.expectedRosterId ?? "not set"],
              ["EXPECTED_TEAM_NAME", v.expectedTeamName ?? "not set"],
              ["Verified team", v.myRosterId != null ? `${v.myTeamName} (roster ${v.myRosterId})` : "Not verified"],
            ].map(([k, val2]) => (
              <div key={String(k)} className="grid grid-cols-[11rem_1fr] gap-3 py-2">
                <dt className="font-mono text-xs text-ink-3">{k}</dt>
                <dd className="text-ink">{String(val2)}</dd>
              </div>
            ))}
          </dl>
          {v.notes.length > 0 && <div className="space-y-2 px-4 pb-4">{v.notes.map((n) => <Notice key={n} level="info">{n}</Notice>)}</div>}
        </Card>

        <Card>
          <CardHeader
            title="Data freshness"
            subtitle="Each source is cached separately. Refreshing league data does not re-download the player database."
            action={<div className="flex flex-col items-end gap-2"><RefreshButton label="Refresh league" /><RefreshButton scope="all" label="Refresh all (incl. players)" /></div>}
          />
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(model.freshness).filter(([k]) => SOURCE_LABEL[k]).map(([k, f]) => (
                <tr key={k} className="border-t border-line/60">
                  <td className="py-2 pl-4 text-ink-2">{SOURCE_LABEL[k]}</td>
                  <td className="py-2 text-ink" title={f.fetchedAt}>{fmtRelative(f.fetchedAt)}</td>
                  <td className="py-2 pr-4 text-right text-xs">
                    {f.stale ? <span className="text-warning" title={f.error}>Stale: refresh failed</span> : <span className="text-ink-3">{f.source === "network" ? "just fetched" : "cached"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-[11px] text-ink-3">Cache lifetimes: rosters & transactions 10 min, league 15 min, traded picks 30 min, trending 30 min, latest week&apos;s stats 1 h, older weeks 24 h, projections 6 h, valuations 12 h, player database 24 h, completed past seasons 7 days. Production source: {model.statsSource === "stats" ? "NFL weekly stats scored with league settings" : "league matchups (fallback)"}.</p>
        </Card>

        <Card>
          <CardHeader title="Valuation source" action={<SourceTag kind={val.kind} label={val.label} />} />
          <div className="space-y-2 px-4 pb-4 text-sm text-ink-2">
            <p>{val.description}</p>
            <p className="text-xs text-ink-3">
              Configured: <code>VALUATION_PROVIDER={val.status.configured}</code> · {val.status.active ? `active, fetched ${fmtDateTime(val.fetchedAt)}` : "not active"}
            </p>
            {val.status.error && <Notice level="warning">Provider error: {val.status.error}. Falling back to the internal estimate.</Notice>}
            <p className="text-xs text-ink-3">
              Sleeper is the source of truth for rosters, ownership, settings and transactions. Values and projections come from the provider above and are labeled wherever they appear. Set <code>VALUATION_PROVIDER=none</code> to use only the internal production + age estimate.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Deployment & storage" subtitle="How this instance stores data and who can reach it" />
          <dl className="divide-y divide-line/60 px-4 pb-3 text-sm">
            {[
              ["Storage", { file: "Local files (.cache / data)", postgres: "Postgres (Neon)", upstash: "Upstash Redis" }[cfg.storage.cache.kind]],
              ["Sign-in", authEnabled() ? "Password required (APP_PASSWORD)" : "Open: set APP_PASSWORD before deploying"],
              ["Scheduled jobs", cfg.cronSecret ? "Enabled (CRON_SECRET set)" : "CRON_SECRET not set: cron endpoints refuse requests"],
              ["Digest delivery", [cfg.digestWebhookUrl ? "webhook" : null, cfg.ntfyTopic ? "ntfy" : null].filter(Boolean).join(" + ") || "In-app only"],
              ["Season simulation", model.odds ? `${model.odds.runs.toLocaleString()} runs (SIM_RUNS)` : "Unavailable"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-2">
                <dt className="text-ink-3">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {cfg.storage.warning && <div className="px-4 pb-3"><Notice level="warning">{cfg.storage.warning}</Notice></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-ink-3">Appearance <ThemeToggle /></div>
            {authEnabled() && (
              <form action={logout}>
                <button type="submit" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-xs text-ink-2 hover:text-ink">Sign out</button>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Strategy overrides" subtitle="Override the model's classification for any team; the trade engine uses the override" />
          <ul className="divide-y divide-line/60 px-4 pb-2">
            {model.teams.map((t) => (
              <li key={t.team.rosterId} className="flex flex-wrap items-center gap-3 py-2">
                <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.team.teamName}</span>
                <StrategyBadge strategy={t.strategy.effective} />
                <StrategyOverride rosterId={t.team.rosterId} inferred={t.strategy.inferred} override={t.strategy.override} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <div id="issues" className="scroll-mt-4" />
          <CardHeader title="Data issues" subtitle="Missing data, mapping failures, API errors and stale caches. Never silently replaced." />
          <div className="space-y-2 px-4 pb-4">
            {model.issues.length === 0 ? (
              <Notice level="ok">No issues: all {model.teams.reduce((a, t) => a + t.players.length, 0)} rostered players mapped, all sources loaded.</Notice>
            ) : (
              model.issues.map((i, k) => <Notice key={`${i.code}-${k}`} level={i.level}>{i.message}</Notice>)
            )}
            <Notice level="info">
              Known limits: weekly stats and projections come from Sleeper&apos;s public but undocumented stats feed; history covers {model.history?.seasonsCovered.join(", ") ?? "the current season"} via the previous-league chain; hindsight trade values use today&apos;s values.
            </Notice>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <SettingsContent />
    </Suspense>
  );
}
