import type { Metadata } from "next";
import { Suspense } from "react";
import { warmInBackground } from "@/lib/server/warm";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // Start loading league data now, so the dashboard is ready by the time the password is entered.
  warmInBackground();
  // Only allow same-site relative redirects.
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : "/";
  return <LoginForm next={safeNext} error={error === "1"} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-[60%] rounded-full bg-accent/12 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[380px] -translate-x-[10%] -translate-y-[20%] rounded-full bg-brand-purple/12 blur-[110px]" />
      <div className="surface-card relative w-full max-w-sm rounded-3xl border border-line p-7">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-[0_10px_34px_-10px_var(--accent)]">
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <path d="M4 18 L10 8 L14 14 L20 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              Dynasty<span className="text-gradient">Edge</span>
            </h1>
            <p className="mt-0.5 text-sm text-ink-3">Your league, decoded. Sign in to continue.</p>
          </div>
        </div>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
