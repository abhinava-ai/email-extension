import { z } from "zod";
import type { NextRequest } from "next/server";
import { consumeAccountToken, findAccountToken } from "@/lib/account-tokens";
import { json } from "@/lib/api";
import { createSession, hashPassword, passwordIsStrong, secureCookie } from "@/lib/auth";
import { db } from "@/lib/db";

const input = z.object({ token: z.string().min(32).max(100), password: z.string().min(12).max(128) });

export async function POST(request: NextRequest) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !passwordIsStrong(parsed.data.password)) return json(request, { error: "Use at least 12 characters with uppercase, lowercase, and a number." }, 400);
  const found = await findAccountToken(parsed.data.token);
  if (!found || !(await consumeAccountToken(found.id))) return json(request, { error: "This link has expired or has already been used." }, 400);
  await db.execute("update users set password_hash=?,must_change_password=0 where id=?", [await hashPassword(parsed.data.password), found.user_id]);
  // Anyone signed in with the old password is signed out.
  await db.execute("update sessions set revoked_at=coalesce(revoked_at,now(3)) where user_id=? and revoked_at is null", [found.user_id]);
  await db.execute("insert into audit_events(user_id,event_type) values (?,?)", [found.user_id, found.purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset"]);
  const session = await createSession(found.user_id, request.headers.get("user-agent") || "");
  const response = json(request, { ok: true });
  response.cookies.set(secureCookie(session.token, session.expires));
  return response;
}
