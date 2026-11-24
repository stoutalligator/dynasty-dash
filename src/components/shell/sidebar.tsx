"use client";

import clsx from "clsx";
import { ArrowLeftRight, BarChart3, Calculator, History, LayoutDashboard, ListOrdered, Mail, Menu, Settings, Shield, Sparkles, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Suspense, useState, ViewTransition, type ReactNode } from "react";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/team", label: "My Team", icon: Shield, group: "Overview" },
  { href: "/league", label: "League", icon: Trophy, group: "Overview" },
  { href: "/trades", label: "Trade Hub", icon: ArrowLeftRight, group: "Market" },
  { href: "/calculator", label: "Trade Calculator", icon: Calculator, group: "Market" },
  { href: "/waivers", label: "Waiver Wire", icon: Sparkles, group: "Market" },
  { href: "/players", label: "Players", icon: Users, group: "Market" },
  { href: "/picks", label: "Draft Picks", icon: ListOrdered, group: "Market" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, group: "Insights" },
  { href: "/history", label: "History", icon: History, group: "Insights" },
  { href: "/digest", label: "Digest", icon: Mail, group: "Insights" },
  { href: "/settings", label: "Settings", icon: Settings, group: "Insights" },
] as const;

const GROUPS = ["Overview", "Market", "Insights"] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The active item's highlight is one shared element (`indicator`) that React's ViewTransition
 * morphs from the old item to the new one on navigation, so it glides instead of jumping.
 */
function NavLinks({ onNavigate, pathname, indicator }: { onNavigate?: () => void; pathname: string; indicator: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="label-caps mb-1.5 px-3">{group}</div>
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === group).map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                    active ? "font-medium text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                  )}
                >
                  {active && (
                    <ViewTransition name={indicator} share="morph" default="none">
                      <span aria-hidden className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent/14 to-accent/4 ring-1 ring-inset ring-accent/25">
                        <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_var(--accent)]" />
                      </span>
                    </ViewTransition>
                  )}
                  <Icon aria-hidden className={clsx("relative size-4 transition-colors", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** usePathname needs a Suspense boundary on dynamic routes; the fallback renders links without highlighting. */
function LiveNavLinks({ onNavigate, indicator }: { onNavigate?: () => void; indicator: string }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} onNavigate={onNavigate} indicator={indicator} />;
}

function Nav({ onNavigate, indicator }: { onNavigate?: () => void; indicator: string }) {
  return (
    <Suspense fallback={<NavLinks pathname="" onNavigate={onNavigate} indicator={indicator} />}>
      <LiveNavLinks onNavigate={onNavigate} indicator={indicator} />
    </Suspense>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-[0_6px_20px_-6px_var(--accent)]">
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface/50 px-3 py-4 backdrop-blur-xl lg:flex">
        <Brand />
        {league}
        <Nav indicator="nav-active-desktop" />
        <div className="mt-auto space-y-3 px-1">
          <ThemeToggle />
          <p className="px-1 text-[11px] leading-relaxed text-ink-3">Read-only Sleeper data. Not affiliated with Sleeper.</p>
        </div>
      </aside>

      <div className="glass backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-40 flex items-center justify-between border-b border-line px-4 py-2.5 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-ink-2 hover:bg-surface-2">
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3 py-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-ink-2 hover:bg-surface-2">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {league}
            <Nav onNavigate={() => setOpen(false)} indicator="nav-active-mobile" />
            <ThemeToggle className="mt-auto self-start" />
          </div>
        </div>
      )}
    </>
  );
}
