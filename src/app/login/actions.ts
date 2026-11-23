"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

/**
 * Check the password and set the session cookie. Returns where to go instead of redirecting:
 * a server-side redirect would render the whole dashboard inside this response, keeping the
 * button on "Signing in…" until it was ready. The client navigates and streams the page instead.
 */
export async function login(_prev: { error: string | null; next?: string }, form: FormData): Promise<{ error: string | null; next?: string }> {
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!checkPassword(password)) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Incorrect password." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return { error: null, next: safeNext(next) };
}

/** Same-site path only: rejects "//host" and "/\host" (browsers treat a backslash like a slash). */
function safeNext(next: string): string {
  return /^\/(?![/\\])/.test(next) && !/[\r\n]/.test(next) ? next : "/";
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
