import { NextResponse, type NextRequest } from "next/server";
import { requestUser } from "@/lib/auth";

export function corsHeaders(request: NextRequest): Record<string,string> {
  const origin = request.headers.get("origin") || "";
  const allowed = new Set([process.env.APP_ORIGIN || "", process.env.EXTENSION_ORIGIN || ""]);
  return allowed.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials":"true", "Vary":"Origin" } : {};
}
export function json(request: NextRequest, body: unknown, status=200) { return NextResponse.json(body, { status, headers:corsHeaders(request) }); }
export function options(request: NextRequest) { return new NextResponse(null, { status:204, headers:{...corsHeaders(request),"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS"} }); }
export async function authenticated(request: NextRequest, allowPasswordChange=false) {
  const user = await requestUser(request);
  if (!user) return { response:json(request,{error:"Authentication required."},401) };
  if (user.mustChangePassword && !allowPasswordChange) return { response:json(request,{error:"Password change required.",code:"PASSWORD_CHANGE_REQUIRED"},403) };
  return { user };
}
