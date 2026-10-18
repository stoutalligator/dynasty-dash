import type { z } from "zod";
import { logger } from "@/lib/log";

const log = logger("http");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly kind: "http" | "timeout" | "network" | "invalid-json" | "schema" = "http",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type FetchJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Called with the parsed body before validation, e.g. to preserve the raw response. */
  onRaw?: (raw: unknown) => void | Promise<void>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

/** GET a JSON resource with timeout, bounded retries (429/5xx/network) and schema validation. */
export async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
  { timeoutMs = 20_000, retries = 2, fetchImpl = fetch, onRaw }: FetchJsonOptions = {},
): Promise<z.infer<S>> {
  let lastError: ApiError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = 500 * 2 ** (attempt - 1);
      log.warn("retrying", { url, attempt, backoffMs: backoff, reason: lastError?.message });
      await sleep(backoff);
    }
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      lastError = new ApiError(
        timedOut ? `Timed out after ${timeoutMs}ms` : `Network error: ${String(err)}`,
        url,
        undefined,
        timedOut ? "timeout" : "network",
      );
      continue;
    }
    if (!res.ok) {
      lastError = new ApiError(`HTTP ${res.status} ${res.statusText}`, url, res.status, "http");
      if (isRetryable(res.status)) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 0 && retryAfter <= 30) await sleep(retryAfter * 1000);
        continue;
      }
      throw lastError;
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ApiError("Response was not valid JSON", url, res.status, "invalid-json");
    }
    if (onRaw) await onRaw(body);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new ApiError(`Unexpected response shape: ${issues}`, url, res.status, "schema");
    }
    return parsed.data;
  }
  throw lastError ?? new ApiError("Request failed", url);
}
