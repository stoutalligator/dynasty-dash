"use client";

import clsx from "clsx";
import { ArrowRight, Shuffle } from "lucide-react";
import { useState, useTransition } from "react";
import { findThreeTeamTrades } from "@/app/actions";
import { Card, CardHeader } from "@/components/ui";
import type { Strategy } from "@/lib/analysis/types";
import type { ThreeTeamEvaluation } from "@/lib/trades/three-team";
import { fmtInt, fmtSigned, fmtSignedInt } from "@/lib/format";
import { FitBadge, OddsLine } from "./proposal-summary";

/** On-demand explorer for three-team trade cycles. */
export function ThreeTeamExplorer({ objective, teamNames }: { objective: Strategy; teamNames: Record<number, string> }) {
  const [results, setResults] = useState<ThreeTeamEvaluation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = (rid: number) => teamNames[rid] ?? `Roster ${rid}`;

  return (
    <Card>
      <CardHeader
        title="Three-team trades (exploratory)"
        subtitle="Cycles where you send to team B, B sends to team C, and C sends to you, for when the team with what you want doesn't want what you have."
        action={
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await findThreeTeamTrades({ objective });
                if (r.ok) setResults(r.data);
                else setError(r.error);
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-1.5 text-sm font-medium text-ink hover:bg-line-strong disabled:opacity-60"
          >
            <Shuffle aria-hidden className="size-4" /> {pending ? "Searching…" : results ? "Search again" : "Explore"}
          </button>
        }
      />
      {error && <p className="px-4 pb-3 text-sm text-critical">{error}</p>}
      {results == null ? (
        <p className="px-4 pb-4 text-sm text-ink-3">Uses the {objective} objective and your untouchables. Each team gives one asset and gets one; all three sides must plausibly benefit.</p>
      ) : results.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-3">No three-team cycle passed the filters for this objective.</p>
      ) : (
        <ul className="divide-y divide-line/60 border-t border-line">
          {results.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-3">Score {e.overall.toFixed(2)}</span>
                <FitBadge fit={e.fit} />
              </div>
              <ol className="space-y-1.5">
                {e.legs.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className={clsx("font-medium", i === 0 ? "text-accent" : "text-ink")}>{name(l.from)}</span>
                    <ArrowRight aria-hidden className="size-3.5 text-ink-3" />
                    <span className={clsx("font-medium", i === 2 ? "text-accent" : "text-ink")}>{name(l.to)}</span>
                    <span className="text-ink-2">: {l.asset.label}</span>
                    <span className="tnum text-[11px] text-ink-3">{fmtInt(l.asset.value)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {e.sides.map((s) => (
                  <div key={s.rosterId} className="rounded-md bg-surface-2/60 px-2.5 py-1.5 text-[11px] text-ink-3">
                    <div className="truncate font-medium text-ink-2">{s.teamName}</div>
                    Lineup <span className={s.lineupDelta >= 0 ? "text-good" : "text-critical"}>{fmtSigned(s.lineupDelta)}</span> · Value{" "}
                    <span className={s.netValue >= 0 ? "text-good" : "text-critical"}>{fmtSignedInt(s.netValue)}</span>
                    {s.needsAddressed.length > 0 && <> · fills {s.needsAddressed.join(", ")}</>}
                    {e.odds?.[s.rosterId] && <OddsLine label="Odds" d={e.odds[s.rosterId]} />}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-2">{e.notes[0]}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-3 text-[11px] text-ink-3">Three-team deals need all three managers to agree. Incentives are inferred from rosters and estimated strategy, not known.</p>
    </Card>
  );
}
