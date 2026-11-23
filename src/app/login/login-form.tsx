"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { login } from "./actions";

export function LoginForm({ next, error: initialError }: { next: string; error: boolean }) {
  const [state, action, pending] = useActionState(login, { error: initialError ? "Incorrect password." : null });
  const router = useRouter();
  const signedIn = !state.error && !!state.next;
  useEffect(() => {
    if (state.next && !state.error) router.replace(state.next);
  }, [state, router]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-2">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending || signedIn} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
        {pending ? "Signing in…" : signedIn ? "Opening your dashboard…" : "Sign in"}
      </button>
    </form>
  );
}
