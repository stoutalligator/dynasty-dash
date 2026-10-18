import clsx from "clsx";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { TradeLedger } from "@/components/history/trade-ledger";
import { PageSkeleton } from "@/components/page-skeleton";
import { Tabs } from "@/components/tabs";
import { Card, CardHeader, InfoTip, Notice, PageTitle } from "@/components/ui";
import { fmtPts, fmtSignedInt, ordinal } from "@/lib/format";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "History" };

/** Sequential blue steps for the partner matrix (validated ramp; lighter = more trades). */
const RAMP = ["var(--surface-3)", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

async function HistoryContent() {
  const { model } = await getLeague();
  const h = model.history;
  if (!h) {
    return <Notice level="warning">League history could not be loaded. The previous seasons are reached through Sleeper&apos;s previous_league_id; see Settings for details.</Notice>;
  }
  const active = h.managers.filter((m) => m.active);
  const maxPair = Math.max(1, ...active.flatMap((m) => Object.values(m.partners)));
  const titles = new Map<string, number>();
  for (const s of h.seasons) if (s.champion?.ownerId) titles.set(s.champion.ownerId, (titles.get(s.champion.ownerId) ?? 0) + 1);

  return (
    <>
      <PageTitle title="League history" subtitle={`Seasons ${h.seasonsCovered.join(", ")} · ${h.trades.length} trades · loaded from Sleeper's previous-league chain`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {h.seasons.map((s) => (
          <div key={s.season} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <Trophy aria-hidden className="size-4 text-brand-amber" /> {s.season} champion
            </div>
            <div className="mt-1 truncate text-lg font-semibold text-ink">{s.champion?.name ?? "Unknown"}</div>
            <div className="text-xs text-ink-3">Runner-up: {s.runnerUp?.name ?? "—"}</div>
          </div>
        ))}
      </div>

      <Tabs
        tabs={[
          { key: "managers", label: "Manager profiles" },
          { key: "ledger", label: "Trade ledger" },
          { key: "partners", label: "Trade partners" },
          { key: "standings", label: "Past standings" },
        ]}
      >
        <Card>
          <CardHeader
            title="Manager trading profiles"
            subtitle={`All completed transactions, ${h.seasonsCovered[0]}–${h.seasonsCovered.at(-1)}`}
            info="Hindsight net = today's value of everything a manager received in two-team trades minus today's value of what they sent. It ignores the points those players scored in between, so treat it as a rough signal of trade outcomes, not a verdict."
          />
          <div className="overflow-x-auto">
            <table className="tnum w-full text-sm md:min-w-[900px]">
              <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="py-2 pl-4 font-medium">Manager</th>
                  <th className="py-2 text-right font-medium">Trades</th>
                  <th className="hidden py-2 pl-4 font-medium md:table-cell">Top partner</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">Players in / out</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">Picks in / out</th>
                  <th className="hidden py-2 text-right font-medium lg:table-cell">Adds</th>
                  <th className="hidden py-2 text-right font-medium lg:table-cell">FAAB spent</th>
                  <th className="py-2 pr-4 text-right font-medium">Hindsight net</th>
                </tr>
              </thead>
              <tbody>
                {active.map((m) => {
                  const [topId, topN] = Object.entries(m.partners).sort((a, b) => b[1] - a[1])[0] ?? [];
                  const top = topId ? h.managers.find((x) => x.ownerId === topId)?.name : null;
                  return (
                    <tr key={m.ownerId} className={clsx("border-b border-line/60", m.rosterId === model.myRosterId && "bg-brand-blue/10")}>
                      <td className="py-2 pl-4">
                        <div className="text-ink">{m.name}{titles.get(m.ownerId) ? <span className="ml-1.5 text-brand-amber" title="Championships">{"🏆".repeat(titles.get(m.ownerId)!)}</span> : null}</div>
                        <div className="text-[11px] text-ink-3">{Object.entries(m.tradesBySeason).sort().map(([s, n]) => `${s}: ${n}`).join(" · ") || "no trades"}</div>
                      </td>
                      <td className="py-2 text-right text-ink">{m.trades}</td>
                      <td className="hidden py-2 pl-4 text-ink-2 md:table-cell">{top ? `${top} (${topN})` : "—"}</td>
                      <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{m.playersIn} / {m.playersOut}</td>
                      <td className="hidden py-2 text-right text-ink-2 sm:table-cell">{m.picksIn} / {m.picksOut}</td>
                      <td className="hidden py-2 text-right text-ink-2 lg:table-cell">{m.waiverAdds}</td>
                      <td className="hidden py-2 text-right text-ink-2 lg:table-cell">${m.faabSpent}</td>
                      <td className={clsx("py-2 pr-4 text-right", m.hindsightNet > 0 ? "text-good" : m.hindsightNet < 0 ? "text-critical" : "text-ink-3")}>{fmtSignedInt(m.hindsightNet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-ink-3">Trade activity also feeds the Trade Hub: frequent traders get a small boost, and rare traders are flagged.</p>
        </Card>

        <Card>
          <CardHeader title="Trade ledger" subtitle="What each side received, valued today. The side with more value today is highlighted." action={<InfoTip text="Traded picks from completed drafts show the player selected with them. Future picks use current pick values. Values are today's, so early trades are judged with hindsight." />} />
          <TradeLedger trades={h.trades} seasons={h.seasonsCovered} managers={active.map((m) => ({ ownerId: m.ownerId, name: m.name }))} />
        </Card>

        <Card>
          <CardHeader title="Who trades with whom" subtitle="Number of trades between each pair of current managers; lighter = more" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="tnum text-[11px]">
              <thead>
                <tr>
                  <th />
                  {active.map((m) => (
                    <th key={m.ownerId} className="h-24 w-8 align-bottom font-medium text-ink-3">
                      <span className="block w-8 origin-bottom-left translate-x-4 -rotate-45 truncate whitespace-nowrap text-left" style={{ width: 96 }}>{m.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.ownerId}>
                    <th className="max-w-40 truncate pr-2 text-left font-medium text-ink-2">{r.name}</th>
                    {active.map((c) => {
                      const n = r.ownerId === c.ownerId ? null : (r.partners[c.ownerId] ?? 0);
                      const step = n ? Math.min(RAMP.length - 1, Math.ceil((n / maxPair) * (RAMP.length - 1))) : 0;
                      return (
                        <td key={c.ownerId} className="p-0.5">
                          <div
                            className="flex size-8 items-center justify-center rounded"
                            style={{ background: n == null ? "transparent" : RAMP[step], color: step === 0 ? "var(--ink-3)" : step >= 4 ? "#0a1020" : "#ffffff" }}
                            title={n == null ? undefined : `${r.name} ↔ ${c.name}: ${n} trade${n === 1 ? "" : "s"}`}
                          >
                            {n == null ? "·" : n || ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          {h.seasons.map((s) => (
            <Card key={s.season}>
              <CardHeader title={`${s.season} final standings`} subtitle="Playoff finish from Sleeper's winners bracket, then regular-season record" />
              <table className="tnum w-full text-sm">
                <tbody>
                  {s.standings.map((t, i) => (
                    <tr key={`${t.ownerId}-${i}`} className="border-t border-line/60">
                      <td className="w-14 py-1.5 pl-4 text-ink-3">{t.place ? ordinal(t.place) : "—"}</td>
                      <td className="py-1.5 text-ink">{t.name}</td>
                      <td className="py-1.5 text-right text-ink-2">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}</td>
                      <td className="py-1.5 pr-4 text-right text-ink-3">{fmtPts(t.pf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </Tabs>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HistoryContent />
    </Suspense>
  );
}
