import clsx from "clsx";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { StrategyBadge } from "@/components/ui";
import type { LeagueModel } from "@/lib/analysis/types";
import { fmtPts, record } from "@/lib/format";

export function StandingsTable({ model, limit, showStrategy = true }: { model: LeagueModel; limit?: number; showStrategy?: boolean }) {
  const rows = model.standings.slice(0, limit ?? model.standings.length).map((rid) => model.teams.find((t) => t.team.rosterId === rid)!);
  const playoffLine = model.league.playoffTeams ?? null;
  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full text-sm sm:min-w-[640px]">
        <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
          <tr>
            <th scope="col" className="w-10 py-2 pl-4 font-medium">#</th>
            <th scope="col" className="py-2 font-medium">Team</th>
            <th scope="col" className="w-16 py-2 text-right font-medium">W-L</th>
            <th scope="col" className="w-20 py-2 pr-4 text-right font-medium sm:pr-0">PF</th>
            <th scope="col" className="hidden w-20 py-2 text-right font-medium sm:table-cell">PA</th>
            <th scope="col" className="hidden w-24 py-2 text-right font-medium md:table-cell">Potential</th>
            <th scope="col" className="hidden w-14 py-2 text-right font-medium sm:table-cell">PR</th>
            {showStrategy && <th scope="col" className="hidden w-28 py-2 pr-4 pl-3 font-medium sm:table-cell">Outlook</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr
              key={t.team.rosterId}
              className={clsx(
                "border-b border-line/60 transition-colors hover:bg-surface-2/60",
                t.team.isMine && "bg-brand-blue/10",
                playoffLine != null && i + 1 === playoffLine && "border-b-line-strong border-b-2",
              )}
            >
              <td className="py-2 pl-4 text-ink-3">{i + 1}</td>
              <td className="py-2">
                <Link href={t.team.isMine ? "/team" : `/league/${t.team.rosterId}`} className="flex items-center gap-2.5 hover:underline">
                  <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={24} />
                  <span className={clsx("truncate", t.team.isMine ? "font-semibold text-ink" : "text-ink")}>{t.team.teamName}</span>
                </Link>
              </td>
              <td className="py-2 text-right text-ink">{record(t.team.wins, t.team.losses, t.team.ties)}</td>
              <td className="py-2 pr-4 text-right text-ink-2 sm:pr-0">{fmtPts(t.team.pointsFor)}</td>
              <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{fmtPts(t.team.pointsAgainst)}</td>
              <td className="hidden py-2 text-right text-ink-2 md:table-cell">{fmtPts(t.team.potentialPoints)}</td>
              <td className="hidden py-2 text-right text-ink-2 sm:table-cell">#{t.powerRank}</td>
              {showStrategy && (
                <td className="hidden py-2 pr-4 pl-3 sm:table-cell">
                  <StrategyBadge strategy={t.strategy.effective} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {playoffLine != null && !limit && <p className="px-4 pt-2 text-[11px] text-ink-3">Heavier rule marks the playoff cut ({playoffLine} teams). Sorted by record, then points for; Sleeper&apos;s official tiebreakers may differ.</p>}
    </div>
  );
}

/** Strategy distribution as a segmented bar with a labeled legend (identity never by color alone). */
export function StrategyDistribution({ model }: { model: LeagueModel }) {
  const groups = (["contender", "retool", "rebuild"] as const).map((s) => ({ s, teams: model.teams.filter((t) => t.strategy.effective === s) }));
  const n = model.teams.length;
  const color = { contender: "bg-contender", retool: "bg-retool", rebuild: "bg-rebuild" };
  const label = { contender: "Contenders", retool: "Retooling", rebuild: "Rebuilding" };
  return (
    <div className="px-4 pb-4">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={groups.map((g) => `${label[g.s]} ${g.teams.length}`).join(", ")}>
        {groups.filter((g) => g.teams.length).map((g) => (
          <div key={g.s} className={color[g.s]} style={{ width: `${(g.teams.length / n) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {groups.map((g) => (
          <li key={g.s} className="text-[13px]">
            <div className="flex items-center gap-2">
              <span aria-hidden className={clsx("size-2.5 rounded-full", color[g.s])} />
              <span className="flex-1 text-ink-2">{label[g.s]}</span>
              <span className="tnum font-semibold text-ink">{g.teams.length}</span>
            </div>
            <div className="mt-0.5 pl-[18px] text-[11px] leading-relaxed text-ink-3">{g.teams.map((t) => t.team.teamName).join(" · ") || "—"}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
