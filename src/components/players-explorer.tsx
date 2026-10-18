"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { RosterTable, Segmented } from "@/components/team/roster-table";
import type { PlayerView } from "@/lib/analysis/types";

export function PlayersExplorer({
  players,
  teams,
  valueLabel,
  myRosterId,
}: {
  players: PlayerView[];
  teams: { rosterId: number; name: string }[];
  valueLabel: string;
  myRosterId: number | null;
}) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [maxAge, setMaxAge] = useState("");
  const [injuredOnly, setInjuredOnly] = useState(false);
  const query = useDeferredValue(q.trim().toLowerCase());
  const teamNames = useMemo(() => Object.fromEntries(teams.map((t) => [t.rosterId, t.name])), [teams]);

  const filtered = useMemo(
    () =>
      players.filter((p) => {
        if (query && !`${p.name} ${p.nflTeam ?? ""}`.toLowerCase().includes(query)) return false;
        if (owner === "fa" && p.rosterId != null) return false;
        if (owner === "rostered" && p.rosterId == null) return false;
        if (owner === "others" && (p.rosterId == null || p.rosterId === myRosterId)) return false;
        if (/^\d+$/.test(owner) && p.rosterId !== Number(owner)) return false;
        if (maxAge && (p.age == null || p.age > Number(maxAge))) return false;
        if (injuredOnly && !p.injury) return false;
        return true;
      }),
    [players, query, owner, maxAge, injuredOnly, myRosterId],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <label className="relative">
          <span className="sr-only">Search players</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or NFL team"
            className="w-56 rounded-lg border border-line-strong bg-surface-2 py-1.5 pr-3 pl-8 text-sm text-ink placeholder:text-ink-3"
          />
        </label>
        <label className="text-xs text-ink-3">
          <span className="sr-only">Owner</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink">
            <option value="all">All players</option>
            <option value="rostered">Rostered</option>
            <option value="others">On other teams</option>
            <option value="fa">Free agents (valued)</option>
            {teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Segmented value={maxAge} onChange={setMaxAge} options={["", "23", "25", "27"]} labels={{ "": "Any age", "23": "≤23", "25": "≤25", "27": "≤27" }} label="Maximum age" />
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={injuredOnly} onChange={(e) => setInjuredOnly(e.target.checked)} className="accent-[var(--color-accent)]" />
          Injury designation
        </label>
      </div>
      <RosterTable key={owner} players={filtered} valueLabel={valueLabel} showTeam teamNames={teamNames} initialSort="value" />
    </div>
  );
}
