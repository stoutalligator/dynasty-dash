import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RecentLeagues, SetupFlow } from "@/components/setup-flow";
import { Skeleton } from "@/components/ui";
import { readSelection, resolveActiveLeague } from "@/lib/league/active";

export const metadata: Metadata = { title: "Choose your league" };

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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d="M4 18 L10 8 L14 14 L20 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">Choose your league</h1>
          <p className="text-sm text-ink-3">Find your Sleeper leagues by username, or open any league by its ID.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Setup />
        </Suspense>
      </div>
    </main>
  );
}
