import clsx from "clsx";
import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { PlayerAvatar } from "@/components/avatar";
import { Card, CardHeader, PosBadge } from "@/components/ui";
import type { LeagueModel, PlayerView, TeamAnalysis } from "@/lib/analysis/types";
import { TREND_LABEL } from "@/lib/analysis/trends";
import { fmtPts } from "@/lib/format";

/** Players whose role or production clearly changed over their last three games. */
export function TrendsCard({ model, t, mineOnly }: { model: LeagueModel; t: TeamAnalysis; mineOnly?: boolean }) {
  const mine = t.players.filter((p) => p.trend && p.slot !== "taxi").sort((a, b) => order(a) - order(b) || (b.value ?? 0) - (a.value ?? 0)).slice(0, 5);
  const fa = model.freeAgents.filter((p) => !mineOnly && p.trend?.kind === "rising-role").sort((a, b) => b.trend!.recentPpg - a.trend!.recentPpg).slice(0, 4);
  const others = model.teams
    .filter((x) => x.team.rosterId !== t.team.rosterId)
    .flatMap((x) => x.players)
    .filter((p) => !mineOnly && p.trend?.kind === "rising-role")
    .sort((a, b) => b.trend!.recentPpg - a.trend!.recentPpg)
    .slice(0, 4);
  if (!mine.length && !fa.length && !others.length) return null;
  const teamName = (rid: number | null) => model.teams.find((x) => x.team.rosterId === rid)?.team.teamName ?? "";
  return (
    <Card>
      <CardHeader
        title="Trends to watch"
        subtitle={mineOnly ? "Your players trending up or down over the last 3 games" : "Last 3 games vs. earlier · role changes need usage to move too"}
        info="Rising/shrinking role: production changed by 3+ PPG (and 25%+) and so did usage (snap share ±10 pts or targets+carries ±25%). Hot/cold streak: production moved without a usage change, so it is less likely to last. Needs 5+ games."
      />
      <div className="space-y-3 px-4 pb-4 sm:px-5">
        {mine.length > 0 && <Group title={mineOnly ? "" : "Your team"} players={mine} />}
        {fa.length > 0 && <Group title="Rising roles on waivers" players={fa} sub={() => "Free agent"} />}
        {others.length > 0 && <Group title="Rising roles around the league" players={others} sub={(p) => teamName(p.rosterId)} />}
      </div>
    </Card>
  );
}

const order = (p: PlayerView) => ["rising-role", "shrinking-role", "hot-streak", "cold-streak"].indexOf(p.trend!.kind);

function Group({ title, players, sub }: { title: string; players: PlayerView[]; sub?: (p: PlayerView) => string }) {
  return (
    <div>
      {title && <div className="label-caps mb-1">{title}</div>}
      <ul className="divide-y divide-line/60">
        {players.map((p) => {
          const up = p.trend!.kind === "rising-role" || p.trend!.kind === "hot-streak";
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <li key={p.id} className="flex items-center gap-2.5 py-1.5 text-sm" title={p.trend!.note}>
              <PlayerAvatar id={p.id} name={p.name} size={24} />
              <PosBadge pos={p.position} />
              <span className="min-w-0 flex-1">
                <Link href={`/players/${p.id}`} className="block truncate text-ink hover:underline">{p.name}</Link>
                <span className="block truncate text-[11px] text-ink-3">{sub ? sub(p) : TREND_LABEL[p.trend!.kind]}</span>
              </span>
              <span className="tnum text-right text-xs">
                <span className="text-ink-3">{fmtPts(p.trend!.earlierPpg)} → </span>
                <span className="font-semibold text-ink">{fmtPts(p.trend!.recentPpg)}</span>
              </span>
              <Icon aria-label={TREND_LABEL[p.trend!.kind]} className={clsx("size-4 shrink-0", up ? "text-good" : "text-critical", p.trend!.kind.includes("streak") && "opacity-60")} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
