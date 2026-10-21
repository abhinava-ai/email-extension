import { NextResponse,type NextRequest } from "next/server";
const publicPaths=new Set(["/","/login"]);
export function proxy(request:NextRequest){const token=request.cookies.get("mtv_session")?.value;const path=request.nextUrl.pathname;if(!token&&!publicPaths.has(path)&&!path.startsWith("/api/")){const url=request.nextUrl.clone();url.pathname="/login";url.searchParams.set("next",path);return NextResponse.redirect(url);}if(token&&["/","/login"].includes(path)){const url=request.nextUrl.clone();url.pathname="/dashboard";url.search="";return NextResponse.redirect(url);}return NextResponse.next();}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
