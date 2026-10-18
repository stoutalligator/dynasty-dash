import { ArrowLeftRight, Minus, Plus } from "lucide-react";
import type { LeagueModel } from "@/lib/analysis/types";
import { fmtRelative, ordinal } from "@/lib/format";

type Filter = "all" | "trade" | "waiver" | "free_agent";

/** Completed league transactions, newest first, rendered as readable sentences. */
export function ActivityFeed({ model, limit = 10, filter = "all" }: { model: LeagueModel; limit?: number; filter?: Filter }) {
  const name = (rid: number) => model.teams.find((t) => t.team.rosterId === rid)?.team.teamName ?? `Roster ${rid}`;
  const player = (id: string) => {
    const p = model.playerNames[id];
    return p ? `${p.name}${p.position ? ` (${p.position})` : ""}` : id;
  };
  const txs = model.transactions.filter((t) => t.status === "complete" && (filter === "all" || t.type === filter)).slice(0, limit);
  if (!txs.length) return <p className="px-4 py-6 text-center text-sm text-ink-3">No completed transactions yet.</p>;

  return (
    <ul className="divide-y divide-line/60">
      {txs.map((t) => {
        if (t.type === "trade") {
          return (
            <li key={t.id} className="flex gap-3 px-4 py-2.5">
              <ArrowLeftRight aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-purple" />
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-ink">Trade</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{fmtRelative(new Date(t.createdAt).toISOString())}</span>
                </div>
                {t.rosterIds.map((rid) => {
                  const gets = [
                    ...t.adds.filter((a) => a.rosterId === rid).map((a) => player(a.playerId)),
                    ...t.picks.filter((p) => p.toRosterId === rid).map((p) => `${p.season} ${ordinal(p.round)} (${name(p.originalRosterId)})`),
                    ...t.faab.filter((f) => f.to === rid).map((f) => `$${f.amount} FAAB`),
                  ];
                  return (
                    <div key={rid} className="text-ink-2">
                      <span className="text-ink">{name(rid)}</span> gets {gets.length ? gets.join(", ") : "nothing listed"}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        }
        return (
          <li key={t.id} className="flex gap-3 px-4 py-2.5">
            {t.adds.length ? <Plus aria-hidden className="mt-0.5 size-4 shrink-0 text-good" /> : <Minus aria-hidden className="mt-0.5 size-4 shrink-0 text-critical" />}
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-ink">
                  {t.type === "waiver" ? "Waiver" : t.type === "free_agent" ? "Free agent" : t.type.replace("_", " ")}
                  {t.waiverBid != null && t.waiverBid > 0 && <span className="ml-1 text-ink-3">${t.waiverBid}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{fmtRelative(new Date(t.createdAt).toISOString())}</span>
              </div>
              <div className="text-ink-2">
                <span className="text-ink">{name(t.rosterIds[0])}</span>
                {t.adds.length > 0 && <> added {t.adds.map((a) => player(a.playerId)).join(", ")}</>}
                {t.adds.length > 0 && t.drops.length > 0 && ";"}
                {t.drops.length > 0 && <> dropped {t.drops.map((d) => player(d.playerId)).join(", ")}</>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
