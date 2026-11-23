"use client";

import clsx from "clsx";
import { ArrowLeftRight, CornerDownLeft, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { searchPlayers, type PlayerHit } from "@/app/actions";
import { PlayerAvatar } from "@/components/avatar";
import { PosBadge } from "@/components/ui";
import { fmtInt } from "@/lib/format";
import { NAV } from "./sidebar";

type Item =
  | { kind: "page"; key: string; label: string; href: string; icon: (typeof NAV)[number]["icon"] }
  | { kind: "player"; key: string; hit: PlayerHit; href: string }
  | { kind: "trade"; key: string; hit: PlayerHit; href: string };

const OPEN_EVENT = "open-command-palette";

/** Opens the palette from anywhere (e.g. the header's search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** ⌘K / Ctrl+K: jump to any page or player, or start a trade search around a player. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const query = useDeferredValue(q.trim());

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  // Player search runs on the server against the cached league model.
  useEffect(() => {
    if (!open || query.length < 2) return;
    let cancelled = false;
    start(async () => {
      const r = await searchPlayers(query);
      if (!cancelled && r.ok) setHits(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [query, open]);

  const items = useMemo<Item[]>(() => {
    const ql = query.toLowerCase();
    const pages: Item[] = NAV.filter((n) => !ql || n.label.toLowerCase().includes(ql)).map((n) => ({ kind: "page", key: `page:${n.href}`, label: n.label, href: n.href, icon: n.icon }));
    const players: Item[] =
      query.length >= 2
        ? hits.flatMap((h): Item[] => [
            { kind: "player", key: `p:${h.id}`, hit: h, href: `/players/${h.id}` },
            ...(h.teamName ? [{ kind: "trade" as const, key: `t:${h.id}`, hit: h, href: `/trades?asset=${encodeURIComponent(h.assetId)}` }] : []),
          ])
        : [];
    return [...players, ...pages];
  }, [query, hits]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  if (!open) return null;
  const sel = Math.min(active, Math.max(0, items.length - 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" aria-label="Close" className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={close} />
      <div className="animate-pop-in surface-card relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search aria-hidden className="size-4 text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[sel]);
              }
            }}
            placeholder="Search players or jump to a page…"
            aria-label="Search players or pages"
            aria-controls="palette-results"
            aria-activedescendant={items[sel] ? `palette-${items[sel].key}` : undefined}
            className="h-13 w-full bg-transparent py-4 text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          />
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">ESC</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">{query.length >= 2 ? "No players match." : "Type a player name."}</li>}
          {items.map((it, i) => (
            <li
              key={it.key}
              id={`palette-${it.key}`}
              role="option"
              aria-selected={i === sel}
              onMouseMove={() => setActive(i)}
              onClick={() => go(it)}
              className={clsx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors", i === sel ? "bg-accent/10 text-ink ring-1 ring-inset ring-accent/25" : "text-ink-2")}
            >
              {it.kind === "page" ? (
                <>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
                    <it.icon aria-hidden className="size-4" />
                  </span>
                  <span className="flex-1">{it.label}</span>
                  <span className="text-[11px] text-ink-3">Page</span>
                </>
              ) : it.kind === "player" ? (
                <>
                  <PlayerAvatar id={it.hit.id} name={it.hit.name} size={28} />
                  <PosBadge pos={it.hit.position} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-ink">{it.hit.name}</span>
                    <span className="ml-2 text-xs text-ink-3">
                      {it.hit.nflTeam ?? "FA"} · {it.hit.mine ? "Your team" : (it.hit.teamName ?? "Free agent")}
                    </span>
                  </span>
                  <span className="tnum text-xs text-ink-3">{it.hit.value != null ? fmtInt(it.hit.value) : ""}</span>
                  <UserRound aria-hidden className="size-3.5 text-ink-3" />
                </>
              ) : (
                <>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <ArrowLeftRight aria-hidden className="size-4" />
                  </span>
                  <span className="flex-1">
                    {it.hit.mine ? "Shop" : "Find a deal for"} <span className="font-medium text-ink">{it.hit.name}</span>
                  </span>
                  <span className="text-[11px] text-ink-3">Trade Hub</span>
                </>
              )}
              {i === sel && <CornerDownLeft aria-hidden className="size-3.5 text-ink-3" />}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-3">
          <span><kbd className="font-sans">↑↓</kbd> navigate</span>
          <span><kbd className="font-sans">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="font-sans">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}

/** Header trigger with the shortcut hint. */
export function CommandPaletteButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search players and pages"
      className={clsx("inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs text-ink-3 hover:border-line-strong hover:text-ink-2", className)}
    >
      <Search aria-hidden className="size-3.5" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded border border-line bg-surface px-1 text-[10px] sm:inline">⌘K</kbd>
    </button>
  );
}
