import { NextResponse, type NextRequest } from "next/server";
import { SELECTION_COOKIE } from "@/lib/league/session";

/**
 * No site password: every visitor signs in with their Sleeper username at /setup, and the chosen
 * league lives in a browser-session cookie. Without one, pages go to /setup. Cron endpoints
 * authenticate with CRON_SECRET inside their route handlers.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/setup" || pathname.startsWith("/api/cron/")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.redirect(new URL("/setup", request.url));
  if (request.cookies.has(SELECTION_COOKIE)) return NextResponse.next();
  if (request.method !== "GET" || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Choose a league first (/setup)." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/setup", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt).*)"],
};
