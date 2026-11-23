import clsx from "clsx";
import { ArrowRightLeft, CheckCircle2, CircleAlert, Lock } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Card, CardHeader, PosBadge } from "@/components/ui";
import type { LeagueModel, TeamAnalysis } from "@/lib/analysis/types";
import { fmtPts, record } from "@/lib/format";
import { matchup, startSit } from "@/lib/week/this-week";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : x > 0.995 && x < 1 ? ">99%" : `${Math.round(x * 100)}%`);

/** This week at a glance: the matchup, what the next game is worth, and lineup fixes. */
export function ThisWeekCard({ model, t }: { model: LeagueModel; t: TeamAnalysis }) {
  const m = matchup(model, t);
  const ss = startSit(t, new Set(model.liveWeek?.played ?? []));
  const stakes = model.odds?.stakes ?? null;
  if (!m && !ss && !stakes) return null;
  const opp = m?.opponent;
  const final = m != null && m.remainingShare === 0;
  const stakesOpp = stakes ? model.teams.find((x) => x.team.rosterId === stakes.opponentRosterId) : null;

  return (
    <Card>
      <CardHeader
        title={`Week ${m?.week ?? ss?.week ?? ""}`}
        subtitle={m?.live ? (final ? "Final" : "Live · players who've played count actual points, the rest their projection") : "Projected from the lineups set in Sleeper"}
        info="Win probability uses each side's expected final score and the same week-to-week spread as the season simulation, narrowed as games are played. Projections are Sleeper's, scaled to this league's scoring."
      />

      {m && opp && (
        <div className="px-4 pb-4 sm:px-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Side name={t.team.teamName} avatar={t.team.avatarUrl} rec={record(t.team.wins, t.team.losses, t.team.ties)} score={m.live ? m.live.mine : m.myProjected} sub={m.live && !final ? `→ ${fmtPts(m.myProjected)} proj.` : m.live ? "" : "projected"} lead={m.myProjected >= m.theirProjected} />
            <span className="text-xs font-semibold text-ink-3">vs</span>
            <Side name={opp.team.teamName} avatar={opp.team.avatarUrl} rec={record(opp.team.wins, opp.team.losses, opp.team.ties)} score={m.live ? m.live.theirs : m.theirProjected} sub={m.live && !final ? `→ ${fmtPts(m.theirProjected)} proj.` : m.live ? "" : "projected"} lead={m.theirProjected > m.myProjected} align="right" href={`/league/${opp.team.rosterId}`} />
          </div>
          {/* Win probability: one bar split between the two sides. */}
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="font-semibold text-ink">{final ? (m.myProjected > m.theirProjected ? "Won" : m.myProjected < m.theirProjected ? "Lost" : "Tied") : `${pct(m.winProbability)} to win`}</span>
              {!final && <span className="text-ink-3">{pct(1 - m.winProbability)}</span>}
            </div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Win probability ${pct(m.winProbability)}`}>
              <div className="animate-grow-x rounded-l-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${Math.max(2, m.winProbability * 100)}%` }} />
              <div className="flex-1 rounded-r-full bg-surface-3" />
            </div>
          </div>
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:underline">
              <span className="group-open:hidden">Show slot-by-slot</span>
              <span className="hidden group-open:inline">Hide slot-by-slot</span>
            </summary>
            <table className="tnum mt-2 w-full text-xs">
              <tbody>
                {m.battles.map((b, i) => {
                  const mv = b.mine ? (b.mine.played ? b.mine.live! : b.mine.proj) : 0;
                  const tv = b.theirs ? (b.theirs.played ? b.theirs.live! : b.theirs.proj) : 0;
                  return (
                    <tr key={i} className="border-t border-line/60">
                      <td className={clsx("truncate py-1.5 pr-2", mv > tv ? "font-medium text-ink" : "text-ink-2")}>
                        {b.mine?.name ?? "—"} <span className="text-ink-3">{b.mine ? `${fmtPts(mv)}${b.mine.played ? "" : "p"}` : ""}</span>
                      </td>
                      <td className="w-12 text-center text-[10px] text-ink-3">{b.slot.replace("SUPER_FLEX", "SF").replace("_", " ")}</td>
                      <td className={clsx("truncate py-1.5 pl-2 text-right", tv > mv ? "font-medium text-ink" : "text-ink-2")}>
                        <span className="text-ink-3">{b.theirs ? `${fmtPts(tv)}${b.theirs.played ? "" : "p"}` : ""}</span> {b.theirs?.name ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-3">p = projected (hasn&apos;t played yet)</p>
          </details>
        </div>
      )}

      {stakes && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <div className="label-caps mb-2">What&apos;s at stake · week {stakes.week}{stakesOpp ? ` vs ${stakesOpp.team.teamName}` : ""}</div>
          <div className="grid grid-cols-2 gap-2">
            <Branch label="If you win" playoff={stakes.ifWin.playoffPct} title={stakes.ifWin.titlePct} tone="good" />
            <Branch label="If you lose" playoff={stakes.ifLose.playoffPct} title={stakes.ifLose.titlePct} tone="bad" />
          </div>
        </div>
      )}

      {ss && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <div className="label-caps mb-2">Lineup check</div>
          {ss.problems.map((p) => (
            <p key={p.player.id} className="mb-1.5 flex items-center gap-2 text-sm text-ink">
              <CircleAlert aria-hidden className="size-4 shrink-0 text-critical" />
              <span>
                <b>{p.player.name}</b> is in your lineup but {p.reason === "bye" ? "on bye" : p.reason === "out" ? `listed ${p.player.injury?.status}` : "has no projection"}.
              </span>
            </p>
          ))}
          {ss.swaps.length ? (
            <ul className="space-y-1.5">
              {ss.swaps.map((s) => (
                <li key={s.start.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                  <ArrowRightLeft aria-hidden className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    Start <PosBadge pos={s.start.position} /> <b className="text-ink">{s.start.name}</b>
                    {s.bench && (
                      <>
                        {" "}over <span className="text-ink-2">{s.bench.name}</span>
                      </>
                    )}
                  </span>
                  <span className="tnum text-xs font-semibold text-good">+{fmtPts(s.gain)}</span>
                </li>
              ))}
            </ul>
          ) : (
            !ss.problems.length && (
              <p className="flex items-center gap-2 text-sm text-ink-2">
                <CheckCircle2 aria-hidden className="size-4 text-good" /> Your lineup is already the best projected lineup.
              </p>
            )
          )}
          {ss.locked > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
              <Lock aria-hidden className="size-3" /> {ss.locked} better swap{ss.locked > 1 ? "s" : ""} involve players who already played this week.
            </p>
          )}
          {ss.swaps.length > 0 && <p className="mt-2 text-[11px] text-ink-3">Make changes in the Sleeper app. Players lock when their game starts.</p>}
        </div>
      )}
    </Card>
  );
}

function Side({ name, avatar, rec, score, sub, lead, align, href }: { name: string; avatar: string | null; rec: string; score: number; sub: string; lead: boolean; align?: "right"; href?: string }) {
  const nameEl = <span className="truncate text-sm font-medium text-ink">{name}</span>;
  return (
    <div className={clsx("flex min-w-0 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <Avatar src={avatar} name={name} size={36} />
      <div className="min-w-0">
        {href ? <Link href={href} className="block truncate hover:underline">{nameEl}</Link> : <div className="truncate">{nameEl}</div>}
        <div className={clsx("tnum text-2xl leading-tight font-semibold tracking-tight", lead ? "text-ink" : "text-ink-2")}>{fmtPts(score)}</div>
        <div className="text-[11px] text-ink-3">
          {rec}
          {sub && ` · ${sub}`}
        </div>
      </div>
    </div>
  );
}

function Branch({ label, playoff, title, tone }: { label: string; playoff: number; title: number; tone: "good" | "bad" }) {
  return (
    <div className={clsx("rounded-xl border px-3 py-2", tone === "good" ? "border-good/25 bg-good/6" : "border-critical/25 bg-critical/6")}>
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="tnum text-lg font-semibold text-ink">{pct(playoff)} <span className="text-xs font-normal text-ink-3">playoffs</span></div>
      <div className="tnum text-[11px] text-ink-3">Title {(title * 100).toFixed(title < 0.1 ? 1 : 0)}%</div>
    </div>
  );
}
