import clsx from "clsx";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Card, CardHeader, Notice } from "@/components/ui";
import type { LeagueModel } from "@/lib/analysis/types";
import { fmtPts } from "@/lib/format";

const pct = (x: number) => (x === 0 ? "—" : x < 0.005 ? "<1%" : x > 0.995 && x < 1 ? ">99%" : `${Math.round(x * 100)}%`);

/** A percentage as a thin meter (track = lighter step of the same hue) with the number beside it. */
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center justify-end gap-2" aria-label={`${label} ${pct(value)}`}>
      <div className="hidden h-1.5 w-16 rounded-full bg-brand-blue/15 sm:block" aria-hidden>
        <div className="h-1.5 rounded-full bg-brand-blue" style={{ width: `${Math.max(value > 0 ? 3 : 0, value * 100)}%` }} />
      </div>
      <span className="tnum w-10 text-right text-ink">{pct(value)}</span>
    </div>
  );
}

export function OddsTable({ model }: { model: LeagueModel }) {
  const o = model.odds;
  if (!o) return <Notice level="info">Season odds need Sleeper projections and a remaining schedule; they are unavailable right now (for example, in the offseason).</Notice>;
  const rows = [...o.teams].sort((a, b) => b.titlePct - a.titlePct || b.playoffPct - a.playoffPct);
  return (
    <Card>
      <CardHeader
        title="Playoff & championship odds"
        subtitle={`${o.runs.toLocaleString()} simulated seasons · weeks ${o.regularWeeks[0]}–${o.regularWeeks.at(-1)} + playoffs ${o.playoffWeeks.join(", ")}`}
        info="Each simulated season plays out the remaining schedule using every team's best projected lineup each week (Sleeper projections, calibrated to this league), with random week-to-week variance measured from this league's history."
      />
      <div className="overflow-x-auto">
        <table className="tnum w-full text-sm">
          <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
            <tr>
              <th className="py-2 pl-4 font-medium">Team</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Proj PPG</th>
              <th className="hidden py-2 text-right font-medium md:table-cell">Proj wins</th>
              <th className="py-2 text-right font-medium">Playoffs</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Bye</th>
              <th className="py-2 pr-4 text-right font-medium">Title</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = model.teams.find((x) => x.team.rosterId === r.rosterId)!;
              return (
                <tr key={r.rosterId} className={clsx("border-b border-line/60", t.team.isMine && "bg-brand-blue/10")}>
                  <td className="py-2 pl-4">
                    <Link href={t.team.isMine ? "/team" : `/league/${r.rosterId}`} className="flex items-center gap-2 hover:underline">
                      <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={22} />
                      <span className="truncate text-ink">{t.team.teamName}</span>
                      <span className="text-[11px] text-ink-3">{t.team.wins}-{t.team.losses}</span>
                    </Link>
                  </td>
                  <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{fmtPts(r.projectedPpg)}</td>
                  <td className="hidden py-2 text-right text-ink-2 md:table-cell">{r.avgWins.toFixed(1)}</td>
                  <td className="py-2"><Meter value={r.playoffPct} label="Playoffs" /></td>
                  <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{pct(r.byePct)}</td>
                  <td className="py-2 pr-4"><Meter value={r.titlePct} label="Title" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-0.5 px-8 py-3 text-[11px] text-ink-3">
        {o.assumptions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </Card>
  );
}
