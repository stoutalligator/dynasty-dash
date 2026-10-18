"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-critical/40 bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">Couldn&apos;t load league data</h2>
      <p className="mt-2 text-sm text-ink-2">
        The Sleeper API could not be reached and there is no cached copy to fall back on. Nothing has been substituted.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs text-ink-3">{message}</pre>
      <button type="button" onClick={() => retry()} className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
        Try again
      </button>
    </div>
  );
}
