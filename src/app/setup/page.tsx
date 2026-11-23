import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RecentLeagues, SetupFlow } from "@/components/setup-flow";
import { Skeleton } from "@/components/ui";
import { readSelection, resolveActiveLeague } from "@/lib/league/active";

export const metadata: Metadata = { title: "Sign in with Sleeper" };

async function Setup() {
  await connection();
  const [active, selection] = await Promise.all([resolveActiveLeague(), readSelection()]);
  return (
    <>
      {selection?.recent.length ? (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Switch to a recent league</h2>
          <RecentLeagues recent={selection.recent} currentLeagueId={active?.leagueId ?? null} />
        </div>
      ) : null}
      <SetupFlow currentLeagueId={active?.leagueId ?? null} savedUsername={selection?.username ?? null} />
      {active && (
        <p className="mt-6 text-sm">
          <Link href="/" className="text-accent hover:underline">
            ← Back to the dashboard
          </Link>
        </p>
      )}
    </>
  );
}

export default function SetupPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-10">
      <div aria-hidden className="pointer-events-none fixed top-0 left-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/10 blur-[120px]" />
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-[0_10px_34px_-10px_var(--accent)]">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d="M4 18 L10 8 L14 14 L20 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Dynasty<span className="text-gradient">Edge</span>
          </h1>
          <p className="text-sm text-ink-3">Enter your Sleeper username and pick a league. Nothing is saved after you close the browser.</p>
        </div>
      </div>
      <div className="surface-card rounded-2xl border border-line p-5">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Setup />
        </Suspense>
      </div>
    </main>
  );
}
