/**
 * Scheduled-job authorization. (There is no site password: visitors sign in with their Sleeper
 * username, see lib/league/active.)
 */

const enc = new TextEncoder();

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorizedCron(authHeader: string | null): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && !!authHeader && safeEqual(authHeader, `Bearer ${s}`);
}
