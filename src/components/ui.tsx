import clsx from "clsx";
import { AlertTriangle, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { Confidence, Strategy } from "@/lib/analysis/types";
import type { InjuryInfo } from "@/lib/league/models";

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-xl border border-line bg-surface", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, info }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; info?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "accent" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={clsx("tnum mt-1 text-xl font-semibold", tone === "accent" ? "text-accent" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

const POS_CLASS: Record<string, string> = {
  QB: "text-pos-qb bg-pos-qb/12 ring-pos-qb/30",
  RB: "text-pos-rb bg-pos-rb/12 ring-pos-rb/30",
  WR: "text-pos-wr bg-pos-wr/12 ring-pos-wr/30",
  TE: "text-pos-te bg-pos-te/12 ring-pos-te/30",
};

export function PosBadge({ pos, className }: { pos: string | null; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 min-w-8 items-center justify-center rounded px-1 text-[10px] font-bold tracking-wide ring-1 ring-inset",
        POS_CLASS[pos ?? ""] ?? "bg-surface-3 text-ink-2 ring-line",
        className,
      )}
    >
      {pos ?? "?"}
    </span>
  );
}

const INJURY_TONE: Record<string, "critical" | "serious" | "warning"> = {
  Out: "critical", IR: "critical", PUP: "critical", Sus: "critical", NA: "critical", DNR: "critical", COV: "critical",
  Doubtful: "serious",
  Questionable: "warning",
};

export function InjuryBadge({ injury, compact }: { injury: InjuryInfo | null; compact?: boolean }) {
  if (!injury) return compact ? null : <span className="text-xs text-ink-3">Healthy</span>;
  const tone = INJURY_TONE[injury.status] ?? "warning";
  const cls = { critical: "text-critical bg-critical/12", serious: "text-serious bg-serious/12", warning: "text-warning bg-warning/10" }[tone];
  const title = [injury.status, injury.bodyPart, injury.practice ? `Practice: ${injury.practice}` : null, injury.notes].filter(Boolean).join(" · ");
  return (
    <span title={`${title} (Sleeper)`} className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>
      <AlertTriangle aria-hidden className="size-3" />
      {injury.status === "Questionable" ? "Q" : injury.status === "Doubtful" ? "D" : injury.status}
      {!compact && injury.bodyPart && <span className="text-ink-3">· {injury.bodyPart}</span>}
    </span>
  );
}

export const STRATEGY_TEXT: Record<Strategy, string> = { contender: "Contender", retool: "Retool", rebuild: "Rebuilder" };

export function StrategyBadge({ strategy, size = "sm" }: { strategy: Strategy; size?: "sm" | "md" }) {
  const cls = {
    contender: "text-contender-ink bg-contender/15 ring-contender/40",
    retool: "text-retool-ink bg-retool/15 ring-retool/40",
    rebuild: "text-rebuild-ink bg-rebuild/15 ring-rebuild/40",
  }[strategy];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wide ring-1 ring-inset", cls, size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]")}>
      <span aria-hidden className={clsx("size-1.5 rounded-full", { contender: "bg-contender", retool: "bg-retool", rebuild: "bg-rebuild" }[strategy])} />
      {STRATEGY_TEXT[strategy]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2">
      <span aria-hidden className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={clsx("h-2 w-1 rounded-sm", i <= ["low", "medium", "high"].indexOf(confidence) ? "bg-ink-2" : "bg-line-strong")} />
        ))}
      </span>
      {confidence} confidence
    </span>
  );
}

/** Meter for a 0–100 score; the track is a darker step of the same hue. */
export function GradeBar({ label, score, grade, detail }: { label: string; score: number; grade: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_2.25rem] items-center gap-3" title={detail}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <div className="h-2 rounded-full bg-brand-blue/15" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} ${grade}`}>
        <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(4, score)}%` }} />
      </div>
      <span className="tnum text-right text-xs font-semibold text-ink">{grade}</span>
    </div>
  );
}

/** Accessible hover/focus tooltip for unfamiliar analytics. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="text-ink-3 hover:text-ink-2">
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-5 left-1/2 z-30 hidden w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-line-strong bg-surface-3 px-2.5 py-2 text-xs leading-relaxed font-normal normal-case tracking-normal text-ink-2 shadow-xl group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {children && <div className="max-w-md text-xs text-ink-3">{children}</div>}
    </div>
  );
}

export function Notice({ level, children }: { level: "error" | "warning" | "info" | "ok"; children: ReactNode }) {
  const Icon = { error: CircleAlert, warning: AlertTriangle, info: Info, ok: CircleCheck }[level];
  const cls = {
    error: "border-critical/40 bg-critical/8 text-ink",
    warning: "border-warning/30 bg-warning/6 text-ink",
    info: "border-line-strong bg-surface-2 text-ink-2",
    ok: "border-good/30 bg-good/6 text-ink",
  }[level];
  const iconCls = { error: "text-critical", warning: "text-warning", info: "text-ink-3", ok: "text-good" }[level];
  return (
    <div className={clsx("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", cls)}>
      <Icon aria-hidden className={clsx("mt-0.5 size-4 shrink-0", iconCls)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Labels values by provenance so estimates are never mistaken for official data. */
export function SourceTag({ kind, label }: { kind: "sleeper" | "third-party" | "internal-estimate"; label?: string }) {
  const text = label ?? { sleeper: "Sleeper data", "third-party": "Third-party value", "internal-estimate": "Our estimate" }[kind];
  const cls = { sleeper: "text-ink-3 ring-line", "third-party": "text-brand-purple ring-brand-purple/30", "internal-estimate": "text-brand-amber ring-brand-amber/30" }[kind];
  return <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", cls)}>{text}</span>;
}
