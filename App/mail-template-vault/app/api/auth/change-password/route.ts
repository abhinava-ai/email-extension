import { z } from "zod";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { authenticated, json, options } from "@/lib/api";
import { createSession, hashPassword, passwordIsStrong, secureCookie, verifyPassword } from "@/lib/auth";
import { db, rows } from "@/lib/db";
const input=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)});
type PasswordRow=RowDataPacket&{password_hash:string};
export { options as OPTIONS };
export async function POST(request:NextRequest){const auth=await authenticated(request,true);if("response" in auth)return auth.response;const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success||!passwordIsStrong(parsed.data.newPassword))return json(request,{error:"Use at least 12 characters with uppercase, lowercase, and a number."},400);const found=await rows<PasswordRow[]>("select password_hash from users where id=?",[auth.user.id]);if(!found[0]||!(await verifyPassword(parsed.data.currentPassword,found[0].password_hash)))return json(request,{error:"Current password is incorrect."},401);if(await verifyPassword(parsed.data.newPassword,found[0].password_hash))return json(request,{error:"Choose a different password."},400);await db.execute("update users set password_hash=?,must_change_password=0 where id=?",[await hashPassword(parsed.data.newPassword),auth.user.id]);await db.execute("delete from sessions where user_id=?",[auth.user.id]);const session=await createSession(auth.user.id,request.headers.get("user-agent")||"");await db.execute("insert into audit_events(user_id,event_type) values (?,?)",[auth.user.id,"auth.password_changed"]);const response=json(request,{ok:true});response.cookies.set(secureCookie(session.token,session.expires));return response;}
