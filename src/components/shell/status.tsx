import { AlertTriangle, ChevronsUpDown, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Skeleton } from "@/components/ui";
import { fmtRelative } from "@/lib/format";
import { getLeague } from "@/lib/server/data";
import { RefreshButton } from "./refresh-button";

/** League identity chip for the sidebar. */
export async function LeagueChip() {
  const { model } = await getLeague();
  const l = model.league;
  return (
    <Link
      href="/setup"
      title="Switch league"
      className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-2 transition hover:border-accent/40"
    >
      <Avatar src={l.avatarUrl} name={l.name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{l.name}</div>
        <div className="truncate text-[11px] text-ink-3">
          {l.season} · {l.totalRosters} Teams · {l.format.superflex ? "Superflex" : "1QB"}
        </div>
      </div>
      <ChevronsUpDown aria-label="Switch league" className="size-4 shrink-0 text-ink-3 group-hover:text-ink-2" />
    </Link>
  );
}

export function LeagueChipSkeleton() {
  return <Skeleton className="h-[50px] w-full" />;
}

/** Season, week and data-freshness bar shown on every page. */
export async function SyncStatus() {
  const { model } = await getLeague();
  const l = model.league;
  const oldest = Object.entries(model.freshness)
    .filter(([k]) => ["league", "rosters", "users", "tradedPicks", "matchups", "transactions"].includes(k))
    .map(([, f]) => f.fetchedAt)
    .sort()[0];
  const problems = model.issues.filter((i) => i.level !== "info");
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-md bg-surface-2 px-2 py-1 font-medium text-ink-2">{l.season} Season</span>
        {l.currentWeek != null && <span>Week {l.currentWeek}{l.status === "in_season" ? "" : ` · ${l.status.replace("_", " ")}`}</span>}
        <span className="hidden sm:inline">·</span>
        <span>{l.format.scoringLabel}{l.format.superflex ? " · Superflex" : ""}</span>
      </div>
      <div className="flex items-center gap-3">
        {problems.length > 0 ? (
          <Link href="/settings#issues" className="inline-flex items-center gap-1 text-warning hover:underline">
            <AlertTriangle className="size-3.5" aria-hidden /> {problems.length} data warning{problems.length > 1 ? "s" : ""}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1">
            <CircleCheck className="size-3.5 text-good" aria-hidden /> Live Sleeper data
          </span>
        )}
        {oldest && <span title={new Date(oldest).toLocaleString()}>Synced {fmtRelative(oldest)}</span>}
        <RefreshButton />
      </div>
    </div>
  );
}

export function SyncStatusSkeleton() {
  return <Skeleton className="h-7 w-full max-w-xl" />;
}
