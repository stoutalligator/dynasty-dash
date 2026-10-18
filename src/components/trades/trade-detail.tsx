import clsx from "clsx";
import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import type { SideImpact, TradeEvaluation } from "@/lib/trades/evaluate";
import { fmtAge, fmtInt, fmtPts, fmtSigned, fmtSignedInt } from "@/lib/format";
import type { OddsDelta } from "@/lib/sim/context";
import { AssetLine, FitBadge, OddsLine } from "./proposal-summary";

const tone = (n: number, eps = 0.05) => (n > eps ? "text-good" : n < -eps ? "text-critical" : "text-ink-3");
const STRAT = { contender: "Contender", retool: "Retool", rebuild: "Rebuilder" };

function Side({ s, title, odds }: { s: SideImpact; title: string; odds?: OddsDelta }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="truncate text-[13px] font-semibold text-ink">{title}</h4>
        <span className="text-[10px] uppercase tracking-wide text-ink-3">{STRAT[s.strategy]} lens</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Gives</div>
          <ul>{s.gives.map((a) => <AssetLine key={a.assetId} a={a} />)}</ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Gets</div>
          <ul>{s.gets.map((a) => <AssetLine key={a.assetId} a={a} />)}</ul>
        </div>
      </div>
      <dl className="tnum mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="text-ink-3">Value (pkg-adj.)</dt>
        <dd className="text-right"><span className="text-ink-2">{fmtInt(s.valueOut)} → {fmtInt(s.valueIn)}</span> <span className={tone(s.netValue)}>{fmtSignedInt(s.netValue)}</span></dd>
        <dt className="text-ink-3">Best lineup</dt>
        <dd className="text-right"><span className="text-ink-2">{fmtPts(s.lineupBefore)} → {fmtPts(s.lineupAfter)}</span> <span className={tone(s.lineupDelta)}>{fmtSigned(s.lineupDelta)}</span></dd>
        {s.positionDeltas.map((d) => (
          <div key={d.position} className="contents">
            <dt className="pl-2 text-ink-3">{d.position} starters</dt>
            <dd className="text-right"><span className="text-ink-2">{fmtPts(d.before)} → {fmtPts(d.after)}</span> <span className={tone(d.after - d.before)}>{fmtSigned(d.after - d.before)}</span></dd>
          </div>
        ))}
        <dt className="text-ink-3">Value-weighted age</dt>
        <dd className="text-right text-ink-2">{fmtAge(s.ageBefore)} → {fmtAge(s.ageAfter)}</dd>
        <dt className="text-ink-3">Future value (picks, ≤25)</dt>
        <dd className={clsx("text-right", tone(s.futureDelta))}>{fmtSignedInt(s.futureDelta)}</dd>
        <dt className="text-ink-3">Draft capital</dt>
        <dd className={clsx("text-right", tone(s.pickValueDelta))}>{fmtSignedInt(s.pickValueDelta)}</dd>
        {s.rosterOverflow > 0 && (
          <>
            <dt className="text-ink-3">Roster spots</dt>
            <dd className="text-right text-serious">must cut {s.rosterOverflow}</dd>
          </>
        )}
      </dl>
      {odds && <OddsLine label="Season odds" d={odds} />}
      {(s.reasonsFor.length > 0 || s.reasonsAgainst.length > 0) && (
        <ul className="mt-3 space-y-1 text-[12px]">
          {s.reasonsFor.map((r) => (
            <li key={r} className="flex gap-1.5 text-ink-2"><CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-good" />{r}</li>
          ))}
          {s.reasonsAgainst.map((r) => (
            <li key={r} className="flex gap-1.5 text-ink-2"><CircleMinus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-critical" />{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Full two-sided breakdown of a trade evaluation. */
export function TradeDetail({ e }: { e: TradeEvaluation }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <FitBadge fit={e.fit} />
        <span>Partner outlook: <span className="text-ink-2">{e.partnerOutlook}</span></span>
        <span>· Score {e.overall.toFixed(2)}</span>
        {e.helpsMe.length > 0 && <span>· Supports your {e.helpsMe.map((h) => STRAT[h].toLowerCase()).join(" / ")} path</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Side s={e.mine} title={`${e.mine.teamName} (you)`} odds={e.odds?.mine} />
        <Side s={e.partner} title={e.partner.teamName} odds={e.odds?.partner} />
      </div>
      {e.risks.length > 0 && (
        <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
            <CircleAlert aria-hidden className="size-3.5" /> Risks & assumptions
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-2">{e.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      <p className="text-[11px] text-ink-3">
        Incentives are inferred from each team&apos;s roster and estimated strategy. This does not predict whether a manager will accept.
      </p>
    </div>
  );
}
