"use client";

import { Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { searchPlayers, type PlayerHit } from "@/app/actions";
import { PlayerAvatar } from "@/components/avatar";
import { PosBadge } from "@/components/ui";

/** Choose up to three players to compare; the selection lives in the URL (?ids=a,b,c). */
export function ComparePicker({ selected }: { selected: { id: string; name: string; position: string | null }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [, start] = useTransition();
  const ids = selected.map((s) => s.id);
  const go = (next: string[]) => router.push(next.length ? `/players/compare?ids=${next.join(",")}` : "/players/compare");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    start(async () => {
      const r = await searchPlayers(term);
      if (!cancelled && r.ok) setHits(r.data.filter((h) => !ids.includes(h.id)).slice(0, 6));
    });
    return () => {
      cancelled = true;
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 py-1 pr-1 pl-1.5 text-sm text-ink">
          <PlayerAvatar id={s.id} name={s.name} size={20} />
          <PosBadge pos={s.position} />
          {s.name}
          <button type="button" aria-label={`Remove ${s.name}`} onClick={() => go(ids.filter((x) => x !== s.id))} className="rounded-full p-1 text-ink-3 hover:bg-surface-3 hover:text-ink">
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {ids.length < 3 && (
        <div className="relative">
          <label className="relative block">
            <span className="sr-only">Add a player to compare</span>
            {ids.length ? <Plus aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" /> : <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />}
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length < 2) setHits([]);
              }}
              placeholder={ids.length ? "Add another player" : "Search a player to compare"}
              className="w-60 rounded-full border border-line-strong bg-surface-2 py-1.5 pr-3 pl-8 text-sm text-ink placeholder:text-ink-3"
            />
          </label>
          {hits.length > 0 && q.trim().length >= 2 && (
            <ul className="animate-pop-in absolute top-full left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setHits([]);
                      go([...ids, h.id]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <PlayerAvatar id={h.id} name={h.name} size={22} />
                    <PosBadge pos={h.position} />
                    <span className="min-w-0 flex-1 truncate text-ink">{h.name}</span>
                    <span className="text-[11px] text-ink-3">{h.nflTeam ?? "FA"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
