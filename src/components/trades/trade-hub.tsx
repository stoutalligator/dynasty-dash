"use client";

import clsx from "clsx";
import { Ban, Bookmark, ChevronDown, Columns3, Lock, Search, Star, Tag, Trash2, Wrench } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deleteProposal, evaluateCustomTrade, findTrades, saveProposal, toggleAssetFlag } from "@/app/actions";
import { Segmented } from "@/components/team/roster-table";
import { Card, CardHeader, InfoTip, PosBadge, StrategyBadge } from "@/components/ui";
import type { Strategy } from "@/lib/analysis/types";
import type { TradeAsset } from "@/lib/trades/assets";
import type { TradeEvaluation } from "@/lib/trades/evaluate";
import { fmtInt, fmtSigned, fmtSignedInt } from "@/lib/format";
import { ProposalSummary } from "./proposal-summary";
import { ThreeTeamExplorer } from "./three-team";
import { TradeDetail } from "./trade-detail";

export type HubTeam = { rosterId: number; name: string; strategy: Strategy; needs: string[]; assets: TradeAsset[] };
export type SavedView = { id: string; savedAt: string; partnerRosterId: number; myAssets: string[]; theirAssets: string[]; evaluation: TradeEvaluation | null; problem: string | null };
type Flags = { untouchables: string[]; tradeBlock: string[]; targets: string[] };

const POSITIONS = ["QB", "RB", "WR", "TE", "PICK"];

export function TradeHub({
  me,
  partners,
  initialProposals,
  initialObjective,
  initialPartner,
  flags: initialFlags,
  saved,
  valueLabel,
}: {
  me: HubTeam;
  partners: HubTeam[];
  initialProposals: TradeEvaluation[];
  initialObjective: Strategy;
  initialPartner: number | null;
  flags: Flags;
  saved: SavedView[];
  valueLabel: string;
}) {
  const [objective, setObjective] = useState<Strategy>(initialObjective);
  const [partner, setPartner] = useState<string>(initialPartner ? String(initialPartner) : "all");
  const [positions, setPositions] = useState<string[]>([]);
  const [maxAge, setMaxAge] = useState("");
  const [offerPicks, setOfferPicks] = useState(true);
  const [maxAssets, setMaxAssets] = useState("2");
  const [proposals, setProposals] = useState(initialProposals);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState(initialFlags);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [compare, setCompare] = useState<TradeEvaluation[]>([]);
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  // Builder
  const [bPartner, setBPartner] = useState<number>(initialPartner ?? partners[0]?.rosterId);
  const [bMine, setBMine] = useState<string[]>([]);
  const [bTheirs, setBTheirs] = useState<string[]>([]);
  const [bResult, setBResult] = useState<TradeEvaluation | null>(null);
  const [bFilter, setBFilter] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const partnerTeam = partners.find((p) => p.rosterId === bPartner);

  const run = (overrides: Partial<{ objective: Strategy }> = {}) =>
    start(async () => {
      setError(null);
      const r = await findTrades({
        objective: overrides.objective ?? objective,
        partnerRosterIds: partner === "all" ? undefined : [Number(partner)],
        positions,
        maxAge: maxAge ? Number(maxAge) : undefined,
        offerPicks,
        maxAssetsPerSide: Number(maxAssets),
        limit: 40,
        perPartner: partner === "all" ? 4 : 15,
      });
      if (r.ok) {
        setProposals(r.data);
        setDirty(false);
      } else setError(r.error);
    });

  const toggleFlag = (list: keyof Flags, assetId: string) =>
    start(async () => {
      const r = await toggleAssetFlag(list, assetId);
      if (r.ok) {
        setFlags(r.data);
        setDirty(true);
      } else setError(r.error);
    });

  const evaluate = (mine: string[], theirs: string[], rid: number) =>
    start(async () => {
      setNote(null);
      if (!mine.length || !theirs.length) {
        setBResult(null);
        return;
      }
      const r = await evaluateCustomTrade({ partnerRosterId: rid, myAssets: mine, theirAssets: theirs, objective });
      if (r.ok) setBResult(r.data);
      else setNote(r.error);
    });

  const openInBuilder = (e: TradeEvaluation) => {
    setBPartner(e.partner.rosterId);
    setBMine(e.mine.gives.map((a) => a.assetId));
    setBTheirs(e.mine.gets.map((a) => a.assetId));
    setBResult(e);
    document.getElementById("builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const save = (partnerRosterId: number, myAssets: string[], theirAssets: string[]) =>
    start(async () => {
      const r = await saveProposal({ partnerRosterId, myAssets, theirAssets });
      setNote(r.ok ? "Saved. It appears under Saved proposals." : r.error);
    });

  const toggleCompare = (e: TradeEvaluation) =>
    setCompare((c) => (c.some((x) => x.id === e.id) ? c.filter((x) => x.id !== e.id) : [...c, e].slice(-3)));

  const flagOf = (id: string): keyof Flags | null =>
    flags.untouchables.includes(id) ? "untouchables" : flags.tradeBlock.includes(id) ? "tradeBlock" : flags.targets.includes(id) ? "targets" : null;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Card>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-4">
          <Field label="Objective" tip="Changes how your side is scored: contend weights lineup gains, rebuild favors picks and young players, retool balances both.">
            <Segmented value={objective} onChange={(v) => { setObjective(v as Strategy); setDirty(true); }} options={["contender", "retool", "rebuild"]} labels={{ contender: "Contend", retool: "Retool", rebuild: "Rebuild" }} label="Objective" />
          </Field>
          <Field label="Partner">
            <select value={partner} onChange={(e) => { setPartner(e.target.value); setDirty(true); }} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink">
              <option value="all">All teams</option>
              {partners.map((p) => (
                <option key={p.rosterId} value={p.rosterId}>{p.name} ({p.strategy})</option>
              ))}
            </select>
          </Field>
          <Field label="I want">
            <div className="flex gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={positions.includes(p)}
                  onClick={() => { setPositions((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p])); setDirty(true); }}
                  className={clsx("rounded-md px-2 py-1 text-xs ring-1 ring-inset transition", positions.includes(p) ? "bg-accent/15 text-accent ring-accent/40" : "text-ink-3 ring-line hover:text-ink-2")}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Max age (incoming)">
            <Segmented value={maxAge} onChange={(v) => { setMaxAge(v); setDirty(true); }} options={["", "24", "26", "28"]} labels={{ "": "Any", "24": "≤24", "26": "≤26", "28": "≤28" }} label="Max age" />
          </Field>
          <Field label="Assets per side">
            <Segmented value={maxAssets} onChange={(v) => { setMaxAssets(v); setDirty(true); }} options={["1", "2", "3"]} label="Assets per side" />
          </Field>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={offerPicks} onChange={(e) => { setOfferPicks(e.target.checked); setDirty(true); }} className="accent-[var(--color-accent)]" />
            Offer my picks
          </label>
          <button
            type="button"
            onClick={() => run()}
            disabled={pending}
            className={clsx("ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60", dirty ? "bg-accent text-accent-ink hover:brightness-110" : "bg-surface-3 text-ink hover:bg-line-strong")}
          >
            <Search aria-hidden className="size-4" /> {pending ? "Searching…" : "Find trades"}
          </button>
        </div>
        {maxAssets === "3" && <p className="px-4 pb-3 text-[11px] text-ink-3">3-asset packages search many more combinations and can take several seconds.</p>}
        {error && <p className="px-4 pb-3 text-sm text-critical">{error}</p>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        {/* Proposals */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">
              {proposals.length} proposals <span className="font-normal text-ink-3">· {objective} objective{dirty && " · filters changed, press Find trades"}</span>
            </h2>
          </div>
          {proposals.length === 0 && (
            <Card><p className="px-4 py-8 text-center text-sm text-ink-3">No trades met the realism filters. Loosen position/age filters, allow more assets per side, or remove untouchables.</p></Card>
          )}
          {proposals.map((e) => {
            const open = expanded === e.id;
            const inCompare = compare.some((c) => c.id === e.id);
            return (
              <Card key={e.id} as="article" className={clsx(inCompare && "ring-1 ring-brand-blue/50")}>
                <div className="p-4">
                  <ProposalSummary e={e} />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setExpanded(open ? null : e.id)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:text-ink">
                      <ChevronDown aria-hidden className={clsx("size-3.5 transition", open && "rotate-180")} /> {open ? "Hide" : "Full"} breakdown
                    </button>
                    <button type="button" onClick={() => toggleCompare(e)} aria-pressed={inCompare} className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", inCompare ? "bg-brand-blue/20 text-ink" : "bg-surface-2 text-ink-2 hover:text-ink")}>
                      <Columns3 aria-hidden className="size-3.5" /> {inCompare ? "Comparing" : "Compare"}
                    </button>
                    <button type="button" onClick={() => openInBuilder(e)} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:text-ink">
                      <Wrench aria-hidden className="size-3.5" /> Edit in builder
                    </button>
                    <button type="button" onClick={() => save(e.partner.rosterId, e.mine.gives.map((a) => a.assetId), e.mine.gets.map((a) => a.assetId))} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:text-ink">
                      <Bookmark aria-hidden className="size-3.5" /> Save
                    </button>
                  </div>
                  {open && <div className="mt-4 border-t border-line pt-4"><TradeDetail e={e} /></div>}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Trade block & untouchables" subtitle="Your assets. The engine never offers untouchables and favors trade-block assets." />
            <ul className="max-h-[380px] divide-y divide-line/60 overflow-y-auto px-4 pb-2">
              {me.assets.filter((a) => a.value > 0).sort((a, b) => b.value - a.value).map((a) => {
                const f = flagOf(a.assetId);
                return (
                  <li key={a.assetId} className="flex items-center gap-2 py-1.5">
                    {a.kind === "pick" ? <span className="w-8 text-center text-[10px] font-bold text-brand-amber">PICK</span> : <PosBadge pos={a.position} />}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.label}</span>
                    <span className="tnum text-[11px] text-ink-3">{fmtInt(a.value)}</span>
                    <IconToggle on={f === "untouchables"} onClick={() => toggleFlag("untouchables", a.assetId)} label={`Untouchable: ${a.label}`} icon={<Lock className="size-3.5" />} activeCls="text-brand-purple" />
                    <IconToggle on={f === "tradeBlock"} onClick={() => toggleFlag("tradeBlock", a.assetId)} label={`Trade block: ${a.label}`} icon={<Tag className="size-3.5" />} activeCls="text-brand-amber" />
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <div id="builder" className="scroll-mt-4" />
            <CardHeader title="Trade builder" subtitle="Pick assets on both sides and evaluate any idea" info="Star a partner's player to mark them as a preferred target; targets get a ranking boost in Find trades." />
            <div className="space-y-3 px-4 pb-4">
              <select
                value={bPartner}
                onChange={(e) => { setBPartner(Number(e.target.value)); setBTheirs([]); setBResult(null); }}
                className="w-full rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink"
                aria-label="Builder partner"
              >
                {partners.map((p) => <option key={p.rosterId} value={p.rosterId}>{p.name}</option>)}
              </select>
              {partnerTeam && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
                  <StrategyBadge strategy={partnerTeam.strategy} /> Needs: {partnerTeam.needs.join(", ") || "none flagged"}
                </div>
              )}
              <input value={bFilter} onChange={(e) => setBFilter(e.target.value)} placeholder="Filter assets" aria-label="Filter builder assets" className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3" />
              <AssetPicker title="You give" assets={me.assets} selected={bMine} filter={bFilter} onToggle={(id) => setBMine((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))} disabled={flags.untouchables} />
              <AssetPicker
                title={`You get from ${partnerTeam?.name ?? "partner"}`}
                assets={partnerTeam?.assets ?? []}
                selected={bTheirs}
                filter={bFilter}
                onToggle={(id) => setBTheirs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))}
                starred={flags.targets}
                onStar={(id) => toggleFlag("targets", id)}
              />
              <div className="flex gap-2">
                <button type="button" disabled={pending || !bMine.length || !bTheirs.length} onClick={() => evaluate(bMine, bTheirs, bPartner)} className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                  Evaluate
                </button>
                <button type="button" disabled={pending || !bMine.length || !bTheirs.length} onClick={() => save(bPartner, bMine, bTheirs)} className="rounded-lg bg-surface-3 px-3 py-2 text-sm text-ink disabled:opacity-50">
                  Save
                </button>
              </div>
              {note && <p aria-live="polite" className="text-xs text-ink-2">{note}</p>}
            </div>
          </Card>
        </div>
      </div>

      {bResult && (
        <Card>
          <CardHeader title="Builder evaluation" subtitle={`${me.name} ↔ ${bResult.partner.teamName} · ${objective} objective`} action={<button type="button" onClick={() => toggleCompare(bResult)} className="text-xs text-accent hover:underline">Add to compare</button>} />
          <div className="px-4 pb-4"><TradeDetail e={bResult} /></div>
        </Card>
      )}

      <ThreeTeamExplorer objective={objective} teamNames={Object.fromEntries([[me.rosterId, me.name], ...partners.map((p) => [p.rosterId, p.name])])} />

      {compare.length > 0 && <CompareTable items={compare} onRemove={(id) => setCompare((c) => c.filter((x) => x.id !== id))} />}

      <Card>
        <CardHeader title="Saved proposals" subtitle="Re-evaluated against current rosters and values each time you load this page" />
        {saved.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-ink-3">Nothing saved yet.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {saved.map((s) => (
              <li key={s.id} className="px-4 py-3">
                {s.evaluation ? <ProposalSummary e={s.evaluation} compact /> : <p className="text-sm text-warning">{s.problem}</p>}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
                  Saved {new Date(s.savedAt).toLocaleDateString()}
                  {s.evaluation && <button type="button" className="text-accent hover:underline" onClick={() => openInBuilder(s.evaluation!)}>Open in builder</button>}
                  <button type="button" onClick={() => start(async () => { await deleteProposal(s.id); })} className="inline-flex items-center gap-1 hover:text-critical"><Trash2 aria-hidden className="size-3" /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[11px] text-ink-3">Values: {valueLabel}. Lineup impact uses actual 2026 league production. Ranking also weighs each partner&apos;s trade history (active traders get a small boost) and the value of players a team would have to cut.</p>
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}{tip && <InfoTip text={tip} />}</div>
      {children}
    </div>
  );
}

function IconToggle({ on, onClick, label, icon, activeCls }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode; activeCls: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label} className={clsx("rounded p-1 transition", on ? clsx(activeCls, "bg-surface-3") : "text-ink-3/50 hover:text-ink-2")}>
      {icon}
    </button>
  );
}

function AssetPicker({
  title,
  assets,
  selected,
  onToggle,
  filter,
  disabled = [],
  starred,
  onStar,
}: {
  title: string;
  assets: TradeAsset[];
  selected: string[];
  onToggle: (id: string) => void;
  filter: string;
  disabled?: string[];
  starred?: string[];
  onStar?: (id: string) => void;
}) {
  const list = useMemo(
    () => assets.filter((a) => !filter || a.label.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.value - a.value),
    [assets, filter],
  );
  const total = assets.filter((a) => selected.includes(a.assetId)).reduce((s, a) => s + a.value, 0);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <span>{title}</span>
        <span className="tnum normal-case">{selected.length} selected · {fmtInt(total)}</span>
      </div>
      <ul className="max-h-52 overflow-y-auto rounded-lg border border-line">
        {list.map((a) => {
          const isDisabled = disabled.includes(a.assetId);
          return (
            <li key={a.assetId} className="flex items-center gap-2 border-b border-line/50 px-2 py-1 last:border-b-0">
              <label className={clsx("flex min-w-0 flex-1 items-center gap-2", isDisabled ? "opacity-40" : "cursor-pointer")}>
                <input type="checkbox" disabled={isDisabled} checked={selected.includes(a.assetId)} onChange={() => onToggle(a.assetId)} className="accent-[var(--color-accent)]" />
                {a.kind === "pick" ? <span className="w-8 text-center text-[10px] font-bold text-brand-amber">PICK</span> : <PosBadge pos={a.position} />}
                <span className="truncate text-[13px] text-ink">{a.label}</span>
                {isDisabled && <Ban aria-label="Untouchable" className="size-3 text-ink-3" />}
              </label>
              <span className="tnum text-[11px] text-ink-3">{fmtInt(a.value)}</span>
              {onStar && (
                <button type="button" onClick={() => onStar(a.assetId)} aria-pressed={starred?.includes(a.assetId)} aria-label={`Target ${a.label}`} className={clsx("p-0.5", starred?.includes(a.assetId) ? "text-brand-amber" : "text-ink-3/40 hover:text-ink-2")}>
                  <Star className="size-3.5" fill={starred?.includes(a.assetId) ? "currentColor" : "none"} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompareTable({ items, onRemove }: { items: TradeEvaluation[]; onRemove: (id: string) => void }) {
  const rows: [string, (e: TradeEvaluation) => React.ReactNode][] = [
    ["Partner", (e) => e.partner.teamName],
    ["You give", (e) => e.mine.gives.map((a) => a.label).join(", ")],
    ["You get", (e) => e.mine.gets.map((a) => a.label).join(", ")],
    ["Fit / outlook", (e) => `${e.fit} · ${e.partnerOutlook}`],
    ["Your value change", (e) => fmtSignedInt(e.mine.netValue)],
    ["Your lineup change", (e) => `${fmtSigned(e.mine.lineupDelta)} PPG`],
    ["Your future value", (e) => fmtSignedInt(e.mine.futureDelta)],
    ["Your age (value-wtd)", (e) => `${e.mine.ageBefore ?? "—"} → ${e.mine.ageAfter ?? "—"}`],
    ["Needs addressed", (e) => e.mine.needsAddressed.join(", ") || "—"],
    ["Their value change", (e) => fmtSignedInt(e.partner.netValue)],
    ["Their lineup change", (e) => `${fmtSigned(e.partner.lineupDelta)} PPG`],
    ["Risks", (e) => `${e.risks.length}`],
    ["Score", (e) => e.overall.toFixed(2)],
  ];
  return (
    <Card>
      <CardHeader title="Side-by-side comparison" subtitle="Up to three proposals" />
      <div className="overflow-x-auto">
        <table className="tnum w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line">
              <th className="w-44 py-2 pl-4 text-left text-[11px] font-medium uppercase tracking-wide text-ink-3">Metric</th>
              {items.map((e, i) => (
                <th key={e.id} className="py-2 pr-4 text-left text-[13px] font-semibold text-ink">
                  Option {i + 1} <button type="button" onClick={() => onRemove(e.id)} className="ml-2 text-[11px] font-normal text-ink-3 hover:text-critical">remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-b border-line/60">
                <td className="py-2 pl-4 text-ink-3">{label}</td>
                {items.map((e) => <td key={e.id} className="py-2 pr-4 text-ink-2">{f(e)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
