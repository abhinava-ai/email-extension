import type { NextRequest } from "next/server";
import { bearerToken, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { json, options } from "@/lib/api";
import { requestUser } from "@/lib/auth";
import { db } from "@/lib/db";
export { options as OPTIONS };
export async function POST(request:NextRequest){const user=await requestUser(request);await revokeSession(bearerToken(request));if(user)await db.execute("insert into audit_events(user_id,event_type) values (?,?)",[user.id,"auth.logout"]);const response=json(request,{ok:true});response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,path:"/",expires:new Date(0)});return response;}
