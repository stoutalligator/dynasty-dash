"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next, error: initialError }: { next: string; error: boolean }) {
  const [state, action, pending] = useActionState(login, { error: initialError ? "Incorrect password." : null });
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
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
