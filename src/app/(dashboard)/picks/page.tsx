import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardHeader, Notice, PageTitle, SourceTag, StrategyBadge } from "@/components/ui";
import { fmtInt, ordinal } from "@/lib/format";
import { getLeague } from "@/lib/server/data";

export const metadata: Metadata = { title: "Draft Picks" };

async function Picks() {
  const { model } = await getLeague();
  const name = (rid: number | null) => (rid == null ? "—" : model.teams.find((t) => t.team.rosterId === rid)?.team.teamName ?? `Roster ${rid}`);
  const rounds = Math.max(1, ...model.teams.flatMap((t) => t.picks.map((p) => p.round)));
  const rows = model.standings.map((rid) => model.teams.find((t) => t.team.rosterId === rid)!);
  const traded = model.teams.flatMap((t) => t.picks).filter((p) => p.source === "traded_picks").sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);

  return (
    <>
      <PageTitle title="Draft capital" subtitle={`Rookie draft picks for ${model.pickSeasons.join(", ")} · ${rounds} rounds`} />
      <div className="mb-5 space-y-2">
        <Notice level="info">
          Ownership comes from Sleeper&apos;s <code>traded_picks</code> endpoint, which lists only picks that changed hands. Every other pick is <em>implied</em> to belong to its original team.
          Pick <strong>values</strong> are estimates from {model.valuation.label}; the nearest season&apos;s slot (early/mid/late) is projected from the original team&apos;s current power rank.
        </Notice>
      </div>

      <Card>
        <CardHeader
          title="Pick ownership by team"
          subtitle="Highlighted picks were acquired from another team. Sorted by standings."
          action={<SourceTag kind="sleeper" label="Ownership: Sleeper" />}
        />
        {/* Phones: one block per team listing its picks by season. */}
        <ul className="border-t border-line md:hidden">
          {rows.map((t) => (
            <li key={t.team.rosterId} className={clsx("border-b border-line/60 px-4 py-3", t.team.isMine && "bg-brand-blue/10")}>
              <div className="flex items-center gap-2">
                <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={22} />
                <Link href={t.team.isMine ? "/team" : `/league/${t.team.rosterId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">{t.team.teamName}</Link>
                <span className="tnum text-xs text-ink-2">{fmtInt(t.capital.value)}</span>
              </div>
              {model.pickSeasons.map((s) => {
                const ps = t.picks.filter((p) => p.season === s).sort((a, b) => a.round - b.round);
                return (
                  <div key={s} className="mt-1.5 flex items-start gap-2">
                    <span className="w-9 pt-0.5 text-[11px] font-semibold text-ink-3">{s}</span>
                    <div className="flex flex-1 flex-wrap gap-1">
                      {ps.length ? ps.map((p) => (
                        <span key={p.assetId} className={clsx("rounded px-1.5 py-0.5 text-[11px]", p.originalRosterId === t.team.rosterId ? "bg-surface-2 text-ink-2" : "bg-brand-amber/15 font-medium text-brand-amber")}>
                          {ordinal(p.round)}{p.originalRosterId !== t.team.rosterId && ` · ${name(p.originalRosterId).slice(0, 12)}`}
                        </span>
                      )) : <span className="text-[11px] text-ink-3">none</span>}
                    </div>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="tnum w-full min-w-[960px] text-sm">
            <thead className="border-y border-line text-[11px] uppercase tracking-wide text-ink-3">
              <tr>
                <th rowSpan={2} className="py-2 pl-4 text-left font-medium">Team</th>
                {model.pickSeasons.map((s) => (
                  <th key={s} colSpan={rounds} className="border-l border-line py-1.5 text-center font-semibold text-ink-2">{s}</th>
                ))}
                <th rowSpan={2} className="border-l border-line py-2 pr-4 pl-3 text-right font-medium">Est. value</th>
              </tr>
              <tr>
                {model.pickSeasons.flatMap((s) =>
                  Array.from({ length: rounds }, (_, i) => (
                    <th key={`${s}-${i}`} className={clsx("py-1.5 text-center font-medium", i === 0 && "border-l border-line")}>{ordinal(i + 1)}</th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.team.rosterId} className={clsx("border-b border-line/60", t.team.isMine && "bg-brand-blue/10")}>
                  <td className="py-2 pl-4">
                    <Link href={t.team.isMine ? "/team" : `/league/${t.team.rosterId}`} className="flex items-center gap-2 hover:underline">
                      <Avatar src={t.team.avatarUrl} name={t.team.teamName} size={22} />
                      <span className="max-w-40 truncate text-ink">{t.team.teamName}</span>
                      <StrategyBadge strategy={t.strategy.effective} />
                    </Link>
                  </td>
                  {model.pickSeasons.flatMap((s) =>
                    Array.from({ length: rounds }, (_, i) => {
                      const ps = t.picks.filter((p) => p.season === s && p.round === i + 1);
                      return (
                        <td key={`${s}-${i}`} className={clsx("px-1 py-1.5 text-center align-top", i === 0 && "border-l border-line")}>
                          {ps.length === 0 ? (
                            <span className="text-xs text-ink-3/60" title="No pick in this round">—</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {ps.map((p) => (
                                <span
                                  key={p.assetId}
                                  title={`${p.season} ${ordinal(p.round)} — original: ${name(p.originalRosterId)}${p.previousOwnerRosterId ? `, previous: ${name(p.previousOwnerRosterId)}` : ""}. ${p.valueNote}`}
                                  className={clsx(
                                    "rounded px-1.5 py-0.5 text-[11px]",
                                    p.originalRosterId === t.team.rosterId ? "bg-surface-2 text-ink-2" : "bg-brand-amber/15 font-medium text-brand-amber ring-1 ring-inset ring-brand-amber/30",
                                  )}
                                >
                                  {p.originalRosterId === t.team.rosterId ? "Own" : name(p.originalRosterId).slice(0, 10)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    }),
                  )}
                  <td className="border-l border-line py-2 pr-4 pl-3 text-right">
                    <div className="text-ink">{fmtInt(t.capital.value)}</div>
                    <div className="text-[11px] text-ink-3">{t.capital.firsts} 1sts · {ordinal(t.capital.rank)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Traded picks" subtitle={`${traded.length} picks have changed hands (Sleeper traded_picks)`} />
        {traded.length ? (
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[640px] text-sm">
              <thead className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="py-2 pl-4 font-medium">Pick</th>
                  <th className="py-2 font-medium">Original team</th>
                  <th className="py-2 font-medium">Previous owner</th>
                  <th className="py-2 font-medium">Current owner</th>
                  <th className="py-2 pr-4 text-right font-medium">Est. value</th>
                </tr>
              </thead>
              <tbody>
                {traded.map((p) => (
                  <tr key={p.assetId} className="border-b border-line/60">
                    <td className="py-2 pl-4 font-medium text-ink">{p.season} {ordinal(p.round)}</td>
                    <td className="py-2 text-ink-2">{name(p.originalRosterId)}</td>
                    <td className="py-2 text-ink-2">{name(p.previousOwnerRosterId)}</td>
                    <td className="py-2 text-ink">{name(p.ownerRosterId)}</td>
                    <td className="py-2 pr-4 text-right text-ink-2" title={p.valueNote}>{fmtInt(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 text-sm text-ink-3">No future picks have been traded.</p>
        )}
        <p className="px-4 py-3 text-[11px] text-ink-3">
          Full pick trade history (dates and counterparties) appears in League → Activity for trades made this league season.
        </p>
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Picks />
    </Suspense>
  );
}
