import type { NextRequest } from "next/server";
import { bearerToken, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { json, options } from "@/lib/api";
export { options as OPTIONS };
export async function POST(request:NextRequest){await revokeSession(bearerToken(request));const response=json(request,{ok:true});response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,path:"/",expires:new Date(0)});return response;}
