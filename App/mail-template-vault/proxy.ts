import { NextResponse, type NextRequest } from "next/server";

const publicPaths = new Set(["/", "/login"]);

export function proxy(request: NextRequest) {
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

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
