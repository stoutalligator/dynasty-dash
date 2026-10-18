/**
 * Minimal single-password gate. The session cookie is `<expiresEpochSeconds>.<hmac>` signed with
 * AUTH_SECRET (or a key derived from APP_PASSWORD). Uses only Web Crypto so it runs in the proxy
 * and in server actions alike. When APP_PASSWORD is unset (local dev) the app is open.
 */

export const SESSION_COOKIE = "dd_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function secret(): string | null {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  return process.env.AUTH_SECRET || `dynasty-edge:${pw}`;
}

export const authEnabled = () => !!process.env.APP_PASSWORD;

async function hmac(message: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const key = secret();
  if (!key) throw new Error("APP_PASSWORD is not set");
  const expires = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  return `${expires}.${await hmac(String(expires), key)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  const key = secret();
  if (!key) return true;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(exp, key));
}

export function checkPassword(candidate: string): boolean {
  const pw = process.env.APP_PASSWORD;
  return !!pw && safeEqual(candidate, pw);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorizedCron(authHeader: string | null): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && !!authHeader && safeEqual(authHeader, `Bearer ${s}`);
}
