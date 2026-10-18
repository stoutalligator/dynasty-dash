import clsx from "clsx";
import { PosBadge } from "@/components/ui";
import type { TradeAsset } from "@/lib/trades/assets";
import type { TradeEvaluation } from "@/lib/trades/evaluate";
import { fmtInt, fmtSigned, fmtSignedInt } from "@/lib/format";

export function FitBadge({ fit }: { fit: TradeEvaluation["fit"] }) {
  const cls = { High: "text-accent bg-accent/10 ring-accent/30", Medium: "text-brand-blue bg-brand-blue/10 ring-brand-blue/30", Low: "text-ink-3 bg-surface-3 ring-line" }[fit];
  return <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", cls)}>{fit} fit</span>;
}

export function AssetLine({ a }: { a: TradeAsset }) {
  return (
    <li className="flex items-center gap-2 py-0.5">
      {a.kind === "pick" ? <span className="inline-flex h-5 min-w-8 items-center justify-center rounded bg-brand-amber/12 px-1 text-[10px] font-bold text-brand-amber ring-1 ring-inset ring-brand-amber/30">PICK</span> : <PosBadge pos={a.position} />}
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.label}</span>
      <span className="tnum text-[11px] text-ink-3">{fmtInt(a.value)}</span>
    </li>
  );
}

const delta = (n: number, d = 1) => (
  <span className={clsx("tnum font-medium", n > 0.05 ? "text-good" : n < -0.05 ? "text-critical" : "text-ink-3")}>{fmtSigned(n, d)}</span>
);
const deltaInt = (n: number) => (
  <span className={clsx("tnum font-medium", n > 0 ? "text-good" : n < 0 ? "text-critical" : "text-ink-3")}>{fmtSignedInt(n)}</span>
);

/** Compact, hook-free proposal summary (usable from server and client components). */
export function ProposalSummary({ e, compact }: { e: TradeEvaluation; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-ink">
          with <span className="text-accent">{e.partner.teamName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-3">{e.partnerOutlook}</span>
          <FitBadge fit={e.fit} />
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="rounded-lg bg-surface-2/60 px-2.5 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-3">You give</div>
          <ul>{e.mine.gives.map((a) => <AssetLine key={a.assetId} a={a} />)}</ul>
        </div>
        <div className="rounded-lg bg-surface-2/60 px-2.5 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-3">You get</div>
          <ul>{e.mine.gets.map((a) => <AssetLine key={a.assetId} a={a} />)}</ul>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span>Your lineup {delta(e.mine.lineupDelta)} PPG</span>
        <span>Value {deltaInt(e.mine.netValue)}</span>
        <span>Their lineup {delta(e.partner.lineupDelta)}</span>
        {!compact && <span>Their value {deltaInt(e.partner.netValue)}</span>}
      </div>
      {!compact && e.mine.reasonsFor.length > 0 && <p className="mt-1.5 text-[12px] text-ink-2">{e.mine.reasonsFor.join(" ")}</p>}
    </div>
  );
}
