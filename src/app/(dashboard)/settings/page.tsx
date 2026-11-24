import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageSuspense } from "@/components/page-suspense";
import { RefreshButton } from "@/components/shell/refresh-button";
import { StrategyOverride } from "@/components/team/strategy-override";
import { Card, CardHeader, Notice, PageTitle, SourceTag } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { getLeague } from "@/lib/server/data";
import { getConfig } from "@/lib/config";
import { switchUserAction } from "@/app/setup/actions";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

/** The sources a manager cares about, in plain language. Everything else lives under Technical details. */
const SOURCE_LABEL: Record<string, string> = {
  rosters: "Rosters & standings",
  transactions: "Trades & waivers",
  matchups: "Scores",
  projections: "Projections",
  valuations: "Player values",
  players: "Player database",
};

const BTN = "inline-flex items-center rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

async function SettingsContent() {
  const { model } = await getLeague();
  const cfg = getConfig();
  const v = model.verification;
  const val = model.valuation;
  const errors = model.issues.filter((i) => i.level === "error" || i.level === "warning");
  const staleCount = Object.values(model.freshness).filter((f) => f.stale).length;
  const me = model.teams.find((t) => t.team.rosterId === v.myRosterId);

  return (
    <>
      <PageTitle title="Settings" subtitle="Your league, how the site looks, and how each team is read" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Your account" action={<Link href="/setup" className={BTN}>Change league</Link>} />
          <dl className="divide-y divide-line/60 px-4 pb-2">
            <Row label="League">{v.leagueFound ? model.league.name : v.configuredLeagueId}</Row>
            <Row label="Signed in as">{v.username ? `@${v.username}` : "Guest"}</Row>
            <Row label="Your team">
              {me ? (
                <span className="flex items-center gap-2">
                  <Avatar src={me.team.avatarUrl} name={me.team.teamName} size={20} />
                  <span className="truncate">{me.team.teamName}</span>
                </span>
              ) : (
                <span className="text-ink-2">None — you&apos;re viewing the league</span>
              )}
            </Row>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-ink-3">Appearance <ThemeToggle /></div>
            <form action={switchUserAction}>
              <button type="submit" className={BTN}>Sign out</button>
            </form>
          </div>
          <p className="px-4 pb-3 text-[11px] text-ink-3">Your sign-in lasts until you close the browser. Nothing about you is saved on the server.</p>
        </Card>

        <Card>
          <CardHeader
            title="Data"
            subtitle={staleCount ? `${staleCount} source${staleCount > 1 ? "s" : ""} couldn't refresh — showing the last good copy` : "Updates automatically; refresh to pull the latest now"}
            action={<RefreshButton label="Refresh" />}
          />
          <dl className="divide-y divide-line/60 px-4 pb-2">
            {Object.entries(SOURCE_LABEL).map(([k, label]) => {
              const f = model.freshness[k as keyof typeof model.freshness];
              if (!f) return null;
              return (
                <Row key={k} label={label}>
                  <span className="flex items-center justify-between gap-2">
                    <span title={fmtDateTime(f.fetchedAt)}>{fmtRelative(f.fetchedAt)}</span>
                    {f.stale && <span className="text-xs text-warning" title={f.error}>Couldn&apos;t refresh</span>}
                  </span>
                </Row>
              );
            })}
          </dl>
          {errors.length > 0 && (
            <div className="space-y-2 px-4 pb-4">
              {errors.map((i, k) => <Notice key={`${i.code}-${k}`} level={i.level}>{i.message}</Notice>)}
            </div>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Team strategies" subtitle="We read each team as contending, retooling or rebuilding. If we got one wrong, change it here and trade ideas will follow." />
          <ul className="grid gap-x-6 px-4 pb-2 md:grid-cols-2">
            {model.teams.map((t) => (
              <li key={t.team.rosterId} className="flex items-center gap-3 border-t border-line/60 py-2">
                <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.team.teamName}</span>
                <StrategyOverride rosterId={t.team.rosterId} inferred={t.strategy.inferred} override={t.strategy.override} showLabel={false} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <details className="group" id="issues">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-ink-2 hover:text-ink">
              <span>Technical details <span className="text-ink-3">· data sources, caching, site setup</span></span>
              <span className="text-ink-3 transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="grid gap-5 border-t border-line px-4 py-4 text-sm md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2"><h3 className="font-medium text-ink">Player values</h3><SourceTag kind={val.kind} label={val.label} /></div>
                <p className="text-ink-2">{val.description}</p>
                <p className="text-xs text-ink-3">Provider <code>{val.status.configured}</code> · {val.status.active ? `fetched ${fmtDateTime(val.fetchedAt)}` : "not active"}</p>
                {val.status.error && <Notice level="warning">Provider error: {val.status.error}. Using the internal estimate instead.</Notice>}
                <p className="text-xs text-ink-3">Rosters, ownership, settings and transactions always come from Sleeper. Weekly stats come from Sleeper&apos;s public stats feed; scoring uses {model.statsSource === "stats" ? "NFL stats scored with your league settings" : "league matchups (fallback)"}.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-ink">Site setup</h3>
                <dl className="divide-y divide-line/60">
                  <Row label="Storage">{{ file: "Local files", postgres: "Postgres", upstash: "Upstash Redis" }[cfg.storage.cache.kind]}</Row>
                  <Row label="Daily pre-load">{cfg.leagueId ? `On (${cfg.leagueId})` : "Off"}</Row>
                  <Row label="Scheduled jobs">{cfg.cronSecret ? "Enabled" : "Disabled (no cron secret)"}</Row>
                  <Row label="Season sims">{model.odds ? `${model.odds.runs.toLocaleString()} runs` : "Unavailable"}</Row>
                  <Row label="History">{model.history?.seasonsCovered.join(", ") ?? "Current season"}</Row>
                </dl>
                {cfg.storage.warning && <div className="mt-2"><Notice level="warning">{cfg.storage.warning}</Notice></div>}
              </div>
              <div className="md:col-span-2">
                <h3 className="mb-1 font-medium text-ink">All sources</h3>
                <ul className="grid gap-x-6 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(model.freshness).map(([k, f]) => (
                    <li key={k} className="flex justify-between gap-2 border-t border-line/60 py-1.5">
                      <span className="text-ink-3">{k}</span>
                      <span className={f.stale ? "text-warning" : "text-ink-2"} title={f.error}>{fmtRelative(f.fetchedAt)}{f.stale ? " · stale" : ""}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <RefreshButton scope="all" label="Refresh everything, including players" />
                  {model.issues.length === 0 ? <span className="text-xs text-ink-3">No data issues.</span> : model.issues.filter((i) => i.level === "info").map((i, k) => <span key={k} className="text-xs text-ink-3">{i.message}</span>)}
                </div>
              </div>
            </div>
          </details>
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <PageSuspense fallback={<PageSkeleton tiles={0} />}>
      <SettingsContent />
    </PageSuspense>
  );
}
