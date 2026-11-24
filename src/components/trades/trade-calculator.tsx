"use client";

import clsx from "clsx";
import { ArrowLeftRight, Check, Link2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { calculateTrade, type CalcResult } from "@/app/actions";
import { PlayerAvatar } from "@/components/avatar";
import { Card, PosBadge, StrategyBadge } from "@/components/ui";
import type { Strategy } from "@/lib/analysis/types";
import type { TradeAsset } from "@/lib/trades/assets";
import type { SideImpact } from "@/lib/trades/evaluate";
import { fmtInt, fmtSigned, fmtSignedInt } from "@/lib/format";

export type CalcTeam = { rosterId: number; name: string; avatarUrl: string | null; strategy: Strategy; isMine: boolean; assets: TradeAsset[] };

const SHORT_UNIT = { production: "PPG", "rest-of-season": "pts/wk", blend: "pts/wk" } as const;

export function TradeCalculator({ teams, initial }: { teams: CalcTeam[]; initial: { a: number; b: number; ag: string[]; bg: string[] } }) {
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);
  const [ag, setAg] = useState<string[]>(initial.ag);
  const [bg, setBg] = useState<string[]>(initial.bg);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const byId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);
  const teamA = byId.get(a)!;
  const teamB = byId.get(b)!;

  // Re-grade whenever the deal changes; keep the URL shareable.
  useEffect(() => {
    const qs = new URLSearchParams({ a: String(a), b: String(b) });
    if (ag.length) qs.set("ag", ag.join(","));
    if (bg.length) qs.set("bg", bg.join(","));
    window.history.replaceState(null, "", `?${qs}`);
    if (!ag.length && !bg.length) { seq.current++; return; }
    const n = ++seq.current;
    start(async () => {
      const r = await calculateTrade({ aRosterId: a, bRosterId: b, aGives: ag, bGives: bg });
      if (n !== seq.current) return;
      if (r.ok) { setResult(r.data); setError(null); } else setError(r.error);
    });
  }, [a, b, ag, bg]);

  const setTeam = (side: "a" | "b", rid: number) => {
    if (side === "a") {
      if (rid === b) { setB(a); setBg(ag); }
      setA(rid); setAg([]);
    } else {
      if (rid === a) { setA(b); setAg(bg); }
      setB(rid); setBg([]);
    }
  };
  const swap = () => { setA(b); setB(a); setAg(bg); setBg(ag); };
  const clear = () => { setAg([]); setBg([]); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  const empty = !ag.length && !bg.length;
  const ev = empty ? undefined : result?.evaluation;
  const shownError = empty ? null : error;
  return (
    <div className="space-y-5">
      <Card>
        <div className="grid lg:grid-cols-[1fr_auto_1fr]">
          <SidePanel team={teamA} teams={teams} other={b} picked={ag} onTeam={(r) => setTeam("a", r)} onChange={setAg} />
          <div className="flex items-center justify-center border-y border-line py-2 lg:border-x lg:border-y-0 lg:px-2 lg:py-0">
            <button type="button" onClick={swap} aria-label="Swap sides" title="Swap sides" className="grid size-9 place-items-center rounded-full border border-line-strong bg-surface-2 text-ink-2 transition hover:rotate-180 hover:text-ink">
              <ArrowLeftRight size={15} />
            </button>
          </div>
          <SidePanel team={teamB} teams={teams} other={a} picked={bg} onTeam={(r) => setTeam("b", r)} onChange={setBg} />
        </div>
        {(ag.length > 0 || bg.length > 0) && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">
              {copied ? <Check size={13} /> : <Link2 size={13} />} {copied ? "Link copied" : "Copy link"}
            </button>
            <button type="button" onClick={clear} className="rounded-lg px-2.5 py-1.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">Clear</button>
          </div>
        )}
      </Card>

      {shownError && <p className="rounded-lg border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">{shownError}</p>}

      {!ev && !shownError && (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Build a trade to grade it</p>
          <p className="mt-1 text-sm text-ink-3">Pick any two teams, add what each side sends, and see who wins, by how much, and how it changes each lineup.</p>
        </div>
      )}

      {ev && result && (
        <div className={clsx("space-y-5 transition-opacity", pending && "opacity-60")}>
          <Card>
            <div className="px-5 pt-5 pb-4 text-center">
              <p className={clsx("text-xl font-semibold tracking-tight", result.verdict.tone === "even" ? "text-accent" : "text-ink")}>{result.verdict.headline}</p>
              {result.verdict.detail && <p className="mt-1 text-sm text-ink-3">{result.verdict.detail}</p>}
            </div>
            {ev.mine.gives.length > 0 && ev.mine.gets.length > 0 && <BalanceBar a={teamA.name} b={teamB.name} aGets={ev.mine.valueIn} bGets={ev.partner.valueIn} />}
            {result.balancer && (
              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line px-4 py-3 text-sm">
                <span className="text-ink-3">To even it out:</span>
                <span className="text-ink">{result.balancer.teamName} adds</span>
                <AssetName asset={result.balancer.asset} />
                <span className="tnum text-ink-3">({fmtInt(result.balancer.asset.value)})</span>
                <button
                  type="button"
                  onClick={() => (result.balancer!.fromRosterId === a ? setAg((x) => [...x, result.balancer!.asset.assetId]) : setBg((x) => [...x, result.balancer!.asset.assetId]))}
                  className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            )}
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <SideResult side={ev.mine} grade={result.grades.a} odds={ev.odds?.mine} />
            <SideResult side={ev.partner} grade={result.grades.b} odds={ev.odds?.partner} />
          </div>
          {ev.risks.length > 0 && (
            <ul className="space-y-1 px-1 text-xs text-ink-3">
              {ev.risks.map((r) => <li key={r}>• {r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SidePanel({ team, teams, other, picked, onTeam, onChange }: { team: CalcTeam; teams: CalcTeam[]; other: number; picked: string[]; onTeam: (rid: number) => void; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const pickedSet = new Set(picked);
  const chosen = picked.map((id) => team.assets.find((x) => x.assetId === id)).filter((x): x is TradeAsset => !!x);
  const total = chosen.reduce((s, x) => s + x.value, 0);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return team.assets
      .filter((x) => !pickedSet.has(x.assetId) && (!needle || x.label.toLowerCase().includes(needle) || (x.position ?? "pick").toLowerCase() === needle))
      .sort((x, y) => y.value - x.value)
      .slice(0, needle ? 12 : 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, team, picked]);

  return (
    <div className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={team.rosterId}
          onChange={(e) => onTeam(Number(e.target.value))}
          aria-label="Team"
          className="min-w-0 flex-1 truncate rounded-lg border border-line-strong bg-surface-2 px-2.5 py-2 text-sm font-medium text-ink"
        >
          {teams.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>{t.name}{t.isMine ? " (you)" : ""}{t.rosterId === other ? " ⇄" : ""}</option>
          ))}
        </select>
        <StrategyBadge strategy={team.strategy} />
      </div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label-caps">Sends</span>
        {chosen.length > 0 && <span className="tnum text-xs text-ink-3">{fmtInt(total)} total</span>}
      </div>
      <ul className="space-y-1.5">
        {chosen.map((x) => (
          <li key={x.assetId} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-sm">
            <AssetName asset={x} />
            <span className="tnum ml-auto text-xs text-ink-2">{fmtInt(x.value)}</span>
            <button type="button" onClick={() => onChange(picked.filter((id) => id !== x.assetId))} aria-label={`Remove ${x.label}`} className="rounded p-0.5 text-ink-3 hover:text-ink">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="relative mt-2">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={`Add from ${team.name}…`}
          className="w-full rounded-lg border border-line bg-surface px-8 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent/60 focus:outline-none"
        />
        {open && matches.length > 0 && (
          <ul data-picker className="mt-1 max-h-64 overflow-auto rounded-lg border border-line-strong bg-surface p-1">
            {matches.map((x) => (
              <li key={x.assetId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange([...picked, x.assetId]); setQ(""); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <AssetName asset={x} />
                  <span className="tnum ml-auto text-xs text-ink-3">{fmtInt(x.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AssetName({ asset }: { asset: TradeAsset }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {asset.kind === "player" ? <PlayerAvatar id={asset.assetId.slice("player:".length)} name={asset.label} size={22} /> : null}
      <PosBadge pos={asset.kind === "pick" ? "PICK" : asset.position} />
      <span className="truncate text-ink">{asset.label}</span>
      {asset.kind === "player" && asset.age != null && <span className="hidden text-xs text-ink-3 sm:inline">{asset.age.toFixed(0)}</span>}
    </span>
  );
}

function BalanceBar({ a, b, aGets, bGets }: { a: string; b: string; aGets: number; bGets: number }) {
  const total = Math.max(aGets + bGets, 1);
  const pctA = (aGets / total) * 100;
  return (
    <div className="px-5 pb-5">
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="truncate text-ink-2">{a} gets <span className="tnum font-medium text-ink">{fmtInt(aGets)}</span></span>
        <span className="truncate text-right text-ink-2">{b} gets <span className="tnum font-medium text-ink">{fmtInt(bGets)}</span></span>
      </div>
      <div className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pctA}%` }} />
        <div className="h-full flex-1 bg-brand-blue/70" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-canvas" />
      </div>
    </div>
  );
}

const GRADE_TONE = (g: string) => (g.startsWith("A") ? "text-accent" : g.startsWith("B") ? "text-ink" : g.startsWith("C") ? "text-warning" : "text-critical");
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

function SideResult({ side, grade, odds }: { side: SideImpact; grade: string; odds?: { playoffBefore: number; playoffAfter: number; titleBefore: number; titleAfter: number } }) {
  const unit = SHORT_UNIT[side.lens];
  const reasons = [...side.reasonsFor.map((r) => ({ r, good: true })), ...side.reasonsAgainst.map((r) => ({ r, good: false }))].slice(0, 4);
  return (
    <Card>
      <div className="flex items-start gap-4 p-5">
        <div className={clsx("w-16 shrink-0 text-center text-4xl leading-none font-semibold tracking-tight", GRADE_TONE(grade))}>{grade}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{side.teamName}</p>
          <p className="text-xs text-ink-3">Graded as a {side.strategy === "contender" ? "contender" : side.strategy === "rebuild" ? "rebuilding team" : "retooling team"}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 border-y border-line text-center">
        <Stat label="Value" value={fmtSignedInt(side.netValue)} good={side.netValue >= 0} />
        <Stat label={`Lineup ${unit}`} value={fmtSigned(side.lineupDelta, 1)} good={side.lineupDelta >= 0} />
        {odds && Math.max(odds.playoffBefore, odds.playoffAfter) >= 0.005 ? <Stat label="Playoff odds" value={`${pct(odds.playoffBefore)} → ${pct(odds.playoffAfter)}`} good={odds.playoffAfter >= odds.playoffBefore} neutral={Math.abs(odds.playoffAfter - odds.playoffBefore) < 0.005} /> : <Stat label="Avg age" value={side.ageAfter != null && side.ageBefore != null ? fmtSigned(side.ageAfter - side.ageBefore, 1) : "—"} neutral />}
      </dl>
      {reasons.length > 0 && (
        <ul className="space-y-1.5 px-5 py-4 text-sm">
          {reasons.map(({ r, good }) => (
            <li key={r} className="flex gap-2">
              <span className={clsx("mt-1.5 size-1.5 shrink-0 rounded-full", good ? "bg-accent" : "bg-critical")} />
              <span className="text-ink-2">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  return (
    <div className="px-2 py-3 [&+&]:border-l [&+&]:border-line">
      <dd className={clsx("tnum text-sm font-medium", neutral ? "text-ink" : good ? "text-accent" : "text-critical")}>{value}</dd>
      <dt className="mt-0.5 text-[11px] text-ink-3">{label}</dt>
    </div>
  );
}
