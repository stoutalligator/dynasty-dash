"use client";

import clsx from "clsx";
import { ArrowRight, Check, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { chooseLeagueAction, findLeaguesAction, lookupLeagueAction } from "@/app/setup/actions";
import { Avatar } from "@/components/avatar";
import type { LeagueOption, SleeperAccountView } from "@/lib/league/discover";

type Found = { account: SleeperAccountView; season: string; leagues: LeagueOption[] };
type Looked = { league: LeagueOption; teams: { rosterId: number; teamName: string; manager: string; avatarUrl: string | null }[] };

function LeagueRow({ l, current, onPick, disabled }: { l: LeagueOption; current: boolean; onPick: () => void; disabled: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={clsx(
          "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition hover:border-accent/50 hover:bg-surface-2/50 disabled:opacity-60",
          current ? "border-accent/50 bg-accent/5" : "border-line bg-surface",
        )}
      >
        <Avatar src={l.avatarUrl} name={l.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{l.name}</span>
            {current && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-bold uppercase text-accent">Current</span>}
          </div>
          <div className="text-xs text-ink-3">
            {l.type} · {l.teams} teams · {l.format} · {l.season} {l.status}
          </div>
        </div>
        <ArrowRight aria-hidden className="size-4 text-ink-3" />
      </button>
    </li>
  );
}

export function SetupFlow({ currentLeagueId, savedUsername }: { currentLeagueId: string | null; savedUsername: string | null }) {
  const [mode, setMode] = useState<"username" | "league">("username");
  const [username, setUsername] = useState(savedUsername ?? "");
  const [found, setFound] = useState<Found | null>(null);
  const [leagueId, setLeagueId] = useState("");
  const [looked, setLooked] = useState<Looked | null>(null);
  const [rosterId, setRosterId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const search = (name: string) =>
    start(async () => {
      setError(null);
      const r = await findLeaguesAction(name);
      if (r.ok) setFound(r.data);
      else {
        setFound(null);
        setError(r.error);
      }
    });

  // Returning users see their leagues straight away.
  useEffect(() => {
    if (savedUsername) search(savedUsername);
  }, [savedUsername]);

  const choose = (input: Parameters<typeof chooseLeagueAction>[0]) =>
    start(async () => {
      setError(null);
      const r = await chooseLeagueAction(input);
      if (r && !r.ok) setError(r.error);
    });

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {(["username", "league"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={clsx("-mb-px border-b-2 px-3 py-2 text-sm", mode === m ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            {m === "username" ? "Sleeper username" : "League ID"}
          </button>
        ))}
      </div>

      {mode === "username" ? (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(username);
            }}
            className="flex gap-2"
          >
            <label className="relative flex-1">
              <span className="sr-only">Sleeper username</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your Sleeper username"
                autoComplete="username"
                autoCapitalize="none"
                className="w-full rounded-lg border border-line-strong bg-surface-2 py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3"
              />
            </label>
            <button type="submit" disabled={pending || !username.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
              {pending && !found ? "Searching…" : "Find leagues"}
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-3">Your team is recognised automatically from your account. Nothing is posted to Sleeper; the app only reads public league data.</p>

          {found && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2.5">
                <Avatar src={found.account.avatarUrl} name={found.account.displayName} size={28} />
                <span className="text-sm text-ink">
                  @{found.account.username} · {found.leagues.length} NFL league{found.leagues.length === 1 ? "" : "s"} in {found.season}
                </span>
              </div>
              {found.leagues.length ? (
                <ul className="space-y-2">
                  {found.leagues.map((l) => (
                    <LeagueRow
                      key={l.leagueId}
                      l={l}
                      current={l.leagueId === currentLeagueId}
                      disabled={pending}
                      onPick={() => choose({ leagueId: l.leagueId, userId: found.account.userId, username: found.account.username, rosterId: null })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">No NFL leagues found for this account. Try the League ID tab.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(null);
                setRosterId(null);
                const r = await lookupLeagueAction(leagueId);
                if (r.ok) setLooked(r.data);
                else {
                  setLooked(null);
                  setError(r.error);
                }
              });
            }}
            className="flex gap-2"
          >
            <label className="flex-1">
              <span className="sr-only">Sleeper league ID</span>
              <input
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 1322942286111207424"
                className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3"
              />
            </label>
            <button type="submit" disabled={pending || leagueId.length < 6} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
              Look up
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-3">The league ID is the long number in the league&apos;s web address on sleeper.com.</p>

          {looked && (
            <div className="mt-5">
              <ul className="mb-4"><LeagueRow l={looked.league} current={looked.league.leagueId === currentLeagueId} disabled onPick={() => undefined} /></ul>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Which team is yours?</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[...looked.teams, null].map((t) => {
                  const id = t?.rosterId ?? 0;
                  const selected = (rosterId ?? 0) === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setRosterId(t ? t.rosterId : null)}
                        aria-pressed={selected}
                        className={clsx("flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm", selected ? "border-accent/60 bg-accent/5" : "border-line hover:bg-surface-2/50")}
                      >
                        {t ? <Avatar src={t.avatarUrl} name={t.teamName} size={24} /> : <span className="size-6" />}
                        <span className="min-w-0 flex-1 truncate text-ink">{t ? t.teamName : "I'm not in this league (view only)"}</span>
                        {t && <span className="truncate text-xs text-ink-3">{t.manager}</span>}
                        {selected && <Check aria-hidden className="size-4 text-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose({ leagueId: looked.league.leagueId, userId: null, username: null, rosterId })}
                className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
              >
                {pending ? "Opening…" : "Open this league"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

export function RecentLeagues({ recent, currentLeagueId }: { recent: { leagueId: string; name: string; season: string; avatar?: string | null }[]; currentLeagueId: string | null }) {
  const [pending, start] = useTransition();
  if (!recent.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {recent.map((r) => (
        <li key={r.leagueId}>
          <button
            type="button"
            disabled={pending || r.leagueId === currentLeagueId}
            onClick={() => start(async () => void (await chooseLeagueAction({ leagueId: r.leagueId, userId: null, username: null, rosterId: null })))}
            className={clsx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", r.leagueId === currentLeagueId ? "border-accent/50 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}
          >
            <Avatar src={r.avatar ?? null} name={r.name} size={18} />
            {r.name} <span className="text-ink-3">{r.season}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
