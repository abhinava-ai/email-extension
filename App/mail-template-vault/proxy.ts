import { NextResponse, type NextRequest } from "next/server";
import { isCrawler } from "@/lib/crawlers";

const publicPaths = new Set(["/", "/login", "/forgot-password", "/set-password"]);

export function proxy(request: NextRequest) {
  // Hostinger can replace robots.txt on its temporary addresses, so the app also refuses these itself.
  if (isCrawler(request.headers.get("user-agent"))) return new NextResponse(null, { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex" } });
  const token = request.cookies.get("mtv_session")?.value;
  const path = request.nextUrl.pathname;
  if (!token && !publicPaths.has(path) && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // A cookie does not prove the session is still valid, and this layer cannot check the
  // database. Sending every cookie holder away from /login traps expired sessions in a
  // redirect loop, so the login page makes that decision itself.
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
