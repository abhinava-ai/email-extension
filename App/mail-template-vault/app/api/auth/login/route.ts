import { z } from "zod";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { db, rows } from "@/lib/db";
import { createSession, secureCookie, verifyPassword } from "@/lib/auth";
import { json, options } from "@/lib/api";
import type { NextRequest } from "next/server";

const input = z.object({ email:z.string().email().max(254), password:z.string().min(1).max(128), client:z.enum(["web","extension"]).default("web") });
type LoginRow = RowDataPacket & { id:string; email:string; display_name:string; password_hash:string; role:"admin"|"member"; must_change_password:number; active:number };
type AttemptRow = RowDataPacket & { failures:number; blocked:number };
export { options as OPTIONS };
export async function POST(request:NextRequest) {
  const parsed=input.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return json(request,{error:"Enter a valid email and password."},400);
  const email=parsed.data.email.trim().toLowerCase();
  const ip=(request.headers.get("x-forwarded-for")||request.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
  const attemptKey=createHash("sha256").update(`${email}|${ip}`).digest("hex");
  const attempts=await rows<AttemptRow[]>("select failures,(blocked_until is not null and blocked_until>now(3)) blocked from login_attempts where attempt_key=?",[attemptKey]);
  if(attempts[0]?.blocked)return json(request,{error:"Too many sign-in attempts. Try again in 15 minutes."},429);
  const found=await rows<LoginRow[]>("select id,email,display_name,password_hash,role,must_change_password,active from users where email=? limit 1",[email]);
  const user=found[0];
  if (!user || !user.active || !(await verifyPassword(parsed.data.password,user.password_hash))) {
    await db.execute(`insert into login_attempts(attempt_key,failures,blocked_until) values (?,1,null)
      on duplicate key update failures=failures+1,blocked_until=if(failures+1>=5,date_add(now(3),interval 15 minute),blocked_until)`,[attemptKey]);
    await new Promise(resolve=>setTimeout(resolve,350));
    return json(request,{error:"Email or password is incorrect."},401);
  }
  await db.execute("delete from login_attempts where attempt_key=?",[attemptKey]);
  const session=await createSession(user.id,request.headers.get("user-agent")||"");
  await db.execute("insert into audit_events(user_id,event_type) values (?,?)",[user.id,"auth.login"]);
  const response=json(request,{token:parsed.data.client==="extension"?session.token:undefined,user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role,mustChangePassword:Boolean(user.must_change_password)}});
  response.cookies.set(secureCookie(session.token,session.expires));
  return response;
}
