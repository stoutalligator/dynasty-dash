import { PlayerAvatar } from "@/components/avatar";
import { Card, CardHeader, PosBadge, ValueTrend } from "@/components/ui";
import type { LeagueModel, PlayerView, TeamAnalysis } from "@/lib/analysis/types";
import { fmtInt, fmtSignedInt, ordinal } from "@/lib/format";

const net = (t: TeamAnalysis) => t.players.reduce((a, p) => a + (p.valueTrend30 ?? 0), 0);

/** 30-day market-value movement on a roster, from the third-party valuation source. */
export function ValueMoversCard({ t, model }: { t: TeamAnalysis; model: LeagueModel }) {
  if (model.valuation.kind !== "third-party" || !t.players.some((p) => p.valueTrend30 != null)) return null;
  const mine = net(t);
  const nets = model.teams.map(net).sort((a, b) => b - a);
  const rank = nets.indexOf(mine) + 1;
  const moved = t.players.filter((p) => p.valueTrend30 != null && p.valueTrend30 !== 0);
  const risers = moved.filter((p) => p.valueTrend30! > 0).sort((a, b) => b.valueTrend30! - a.valueTrend30!).slice(0, 3);
  const fallers = moved.filter((p) => p.valueTrend30! < 0).sort((a, b) => a.valueTrend30! - b.valueTrend30!).slice(0, 3);
  return (
    <Card>
      <CardHeader
        title="Value movers"
        subtitle={`Last 30 days · ${model.valuation.label}`}
        info="Change in each player's market value over the past 30 days, as reported by the valuation source. Useful for spotting sell-high and buy-low moments."
      />
      <div className="px-4 pb-3">
        <div className="flex items-baseline gap-2">
          <span className={`tnum text-2xl font-semibold ${mine >= 0 ? "text-good" : "text-critical"}`}>{fmtSignedInt(mine)}</span>
          <span className="text-xs text-ink-3">roster value · {ordinal(rank)} of {model.teams.length}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 border-t border-line/60 px-4 py-2 sm:grid-cols-2 xl:grid-cols-1">
        <MoverList title="Rising" players={risers} empty="No notable risers." />
        <MoverList title="Falling" players={fallers} empty="No notable fallers." />
      </div>
    </Card>
  );
}

function MoverList({ title, players, empty }: { title: string; players: PlayerView[]; empty: string }) {
  return (
    <div className="py-1">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</div>
      {players.length ? (
        <ul className="divide-y divide-line/60">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 py-1.5 text-sm">
              <PlayerAvatar id={p.id} name={p.name} size={22} />
              <PosBadge pos={p.position} />
              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
              <span className="tnum text-xs text-ink-3">{p.value != null ? fmtInt(p.value) : "—"}</span>
              <ValueTrend trend={p.valueTrend30} className="w-14 justify-end" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-xs text-ink-3">{empty}</p>
      )}
    </div>
  );
}
