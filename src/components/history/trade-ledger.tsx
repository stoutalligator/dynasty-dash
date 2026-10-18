"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { PosBadge } from "@/components/ui";
import type { LedgerTrade } from "@/lib/history/analyze";
import { fmtInt } from "@/lib/format";

export function TradeLedger({ trades, seasons, managers }: { trades: LedgerTrade[]; seasons: string[]; managers: { ownerId: string; name: string }[] }) {
  const [season, setSeason] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [limit, setLimit] = useState(20);
  const rows = useMemo(
    () => trades.filter((t) => (season === "ALL" || t.season === season) && (owner === "ALL" || t.sides.some((s) => s.ownerId === owner))),
    [trades, season, owner],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <select value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season" className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink">
          <option value="ALL">All seasons</option>
          {seasons.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Manager" className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink">
          <option value="ALL">All managers</option>
          {managers.map((m) => <option key={m.ownerId} value={m.ownerId}>{m.name}</option>)}
        </select>
        <span className="ml-auto text-xs text-ink-3">{rows.length} trades</span>
      </div>
      <ul className="divide-y divide-line/60 border-t border-line">
        {rows.slice(0, limit).map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
              <span>
                {t.season}
                {t.week ? ` · week ${t.week}` : ""} · {new Date(t.createdAt).toLocaleDateString()}
              </span>
              {t.sides.length > 2 && <span>{t.sides.length}-team trade</span>}
            </div>
            <div className={clsx("grid gap-2", t.sides.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
              {t.sides.map((s, i) => {
                const leads = t.leader != null && s.ownerId === t.leader;
                return (
                  <div key={`${s.ownerId}-${i}`} className={clsx("rounded-lg px-3 py-2", leads ? "bg-good/8 ring-1 ring-inset ring-good/30" : "bg-surface-2/60")}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{s.name} received</span>
                      <span className="tnum shrink-0 text-[11px] text-ink-2" title="Today's value of what this side received">{fmtInt(s.valueNow)} today</span>
                    </div>
                    <ul className="space-y-0.5">
                      {s.received.map((a, k) => (
                        <li key={k} className="flex items-center gap-2 text-[12.5px]">
                          {a.kind === "pick" ? <span className="w-8 text-center text-[10px] font-bold text-brand-amber">PICK</span> : a.kind === "faab" ? <span className="w-8 text-center text-[10px] font-bold text-good">$</span> : <PosBadge pos={a.position} />}
                          <span className="min-w-0 flex-1 truncate text-ink-2">{a.label}{a.detail && a.kind === "pick" ? <span className="text-ink-3"> · {a.detail}</span> : null}</span>
                          <span className="tnum text-[11px] text-ink-3">{a.value != null ? fmtInt(a.value) : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <div className="p-4">
          <button type="button" onClick={() => setLimit((l) => l + 20)} className="w-full rounded-lg border border-line bg-surface-2 py-2 text-sm text-ink-2 hover:text-ink">
            Show more ({rows.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
