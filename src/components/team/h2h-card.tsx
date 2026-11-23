import clsx from "clsx";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Card, CardHeader } from "@/components/ui";
import type { LeagueModel, TeamAnalysis } from "@/lib/analysis/types";
import type { H2HRecord } from "@/lib/history/h2h";
import { fmtPts } from "@/lib/format";

const rec = (r: { wins: number; losses: number; ties: number }) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`;
const games = (r: H2HRecord) => r.wins + r.losses + r.ties;

/** All-time record between my team and another (on that team's page). */
export function HeadToHeadVsMe({ model, t }: { model: LeagueModel; t: TeamAnalysis }) {
  if (model.myRosterId == null || t.team.isMine) return null;
  const r = model.h2h[model.myRosterId]?.[t.team.rosterId];
  if (!r || !games(r)) return null;
  const lead = r.wins - r.losses;
  return (
    <Card>
      <CardHeader title="Head-to-head vs you" subtitle={`All matchups since ${model.history?.seasonsCovered[0] ?? model.league.season}, playoffs included`} />
      <div className="flex items-end gap-6 px-5 pb-5">
        <div>
          <div className="tnum text-3xl font-semibold tracking-tight text-ink">{rec(r)}</div>
          <div className={clsx("mt-1 text-xs font-medium", lead > 0 ? "text-good" : lead < 0 ? "text-critical" : "text-ink-3")}>
            {lead > 0 ? `You lead by ${lead}` : lead < 0 ? `They lead by ${-lead}` : "Even"}
          </div>
        </div>
        <dl className="tnum grid grid-cols-3 gap-4 text-xs">
          <div><dt className="text-ink-3">This season</dt><dd className="font-semibold text-ink">{rec(r.thisSeason)}</dd></div>
          <div><dt className="text-ink-3">Your avg</dt><dd className="font-semibold text-ink">{fmtPts(r.pointsFor / games(r))}</dd></div>
          <div><dt className="text-ink-3">Their avg</dt><dd className="font-semibold text-ink">{fmtPts(r.pointsAgainst / games(r))}</dd></div>
        </dl>
      </div>
    </Card>
  );
}

/** My all-time record against every manager, best rivalry first. */
export function RivalriesCard({ model, t }: { model: LeagueModel; t: TeamAnalysis }) {
  const mine = model.h2h[t.team.rosterId];
  if (!mine) return null;
  const rows = model.teams
    .filter((o) => o.team.rosterId !== t.team.rosterId && mine[o.team.rosterId] && games(mine[o.team.rosterId]))
    .map((o) => ({ o, r: mine[o.team.rosterId] }))
    .sort((a, b) => games(b.r) - games(a.r) || (b.r.wins - b.r.losses) - (a.r.wins - a.r.losses));
  if (!rows.length) return null;
  const total = rows.reduce((a, x) => ({ wins: a.wins + x.r.wins, losses: a.losses + x.r.losses, ties: a.ties + x.r.ties }), { wins: 0, losses: 0, ties: 0 });
  return (
    <Card>
      <CardHeader title="Rivalries" subtitle={`All-time head-to-head · ${rec(total)} overall`} />
      <ul className="divide-y divide-line/60 px-4 pb-2 sm:px-5">
        {rows.map(({ o, r }) => {
          const n = games(r);
          return (
            <li key={o.team.rosterId} className="flex items-center gap-2.5 py-2 text-sm">
              <Avatar src={o.team.avatarUrl} name={o.team.teamName} size={24} />
              <Link href={`/league/${o.team.rosterId}`} className="min-w-0 flex-1 truncate text-ink hover:underline">{o.team.teamName}</Link>
              {/* Win share bar: wins vs losses in this rivalry. */}
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-critical/25 sm:flex" aria-hidden>
                <span className="h-full rounded-full bg-good" style={{ width: `${(r.wins / n) * 100}%` }} />
              </span>
              <span className={clsx("tnum w-12 text-right text-xs font-semibold", r.wins > r.losses ? "text-good" : r.wins < r.losses ? "text-critical" : "text-ink-2")}>{rec(r)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
