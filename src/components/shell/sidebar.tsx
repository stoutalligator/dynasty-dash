"use client";

import clsx from "clsx";
import { ArrowLeftRight, BarChart3, History, LayoutDashboard, ListOrdered, Menu, Settings, Shield, Sparkles, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team", label: "My Team", icon: Shield },
  { href: "/league", label: "League", icon: Trophy },
  { href: "/players", label: "Players", icon: Users },
  { href: "/waivers", label: "Waiver Wire", icon: Sparkles },
  { href: "/trades", label: "Trade Hub", icon: ArrowLeftRight },
  { href: "/picks", label: "Draft Picks", icon: ListOrdered },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate, pathname }: { onNavigate?: () => void; pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-accent/10 font-medium text-ink ring-1 ring-inset ring-accent/25" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon aria-hidden className={clsx("size-4", active ? "text-accent" : "text-ink-3")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** usePathname needs a Suspense boundary on dynamic routes; the fallback renders links without highlighting. */
function LiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} onNavigate={onNavigate} />;
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinks pathname="" onNavigate={onNavigate} />}>
      <LiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path d="M4 18 L10 8 L14 14 L20 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Dynasty<span className="text-accent">Edge</span>
      </span>
    </Link>
  );
}

/** Persistent sidebar on desktop; slide-over drawer on mobile. `league` is streamed in from the server. */
export function Sidebar({ league }: { league: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 border-r border-line bg-surface/60 px-3 py-4 lg:flex">
        <Brand />
        {league}
        <Nav />
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-ink-3">Read-only Sleeper data. Not affiliated with Sleeper.</p>
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-ink-2 hover:bg-surface-2">
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-5 border-r border-line bg-surface px-3 py-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-ink-2 hover:bg-surface-2">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {league}
            <Nav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
