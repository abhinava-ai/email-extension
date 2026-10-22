import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db, rows } from "@/lib/db";

export const SESSION_COOKIE = "mtv_session";
const SESSION_DAYS = 30;
export type AuthUser = { id: string; email: string; displayName: string; role: "admin" | "member"; mustChangePassword: boolean };
type UserRow = RowDataPacket & { id:string; email:string; display_name:string; role:"admin"|"member"; must_change_password:number; session_id:string };
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function verifyPassword(password: string, hash: string) {
  const validShape = /^\$2[aby]\$/.test(hash);
  const candidate = validShape ? hash : "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  return bcrypt.compare(password, candidate);
}
export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }

export async function createSession(userId: string, userAgent = "", client: "web"|"extension" = "web", ipAddress = "") {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.execute("insert into sessions (id,user_id,token_hash,expires_at,user_agent,client,ip_address) values (?,?,?,?,?,?,?)",
    [randomUUID(), userId, tokenHash(token), expires, userAgent.slice(0, 500), client, ipAddress.slice(0, 45)]);
  return { token, expires };
}

export async function revokeSession(token: string | null) {
  if (token) await db.execute("update sessions set logged_out_at=coalesce(logged_out_at,now(3)) where token_hash=?", [tokenHash(token)]);
}

async function userForToken(token: string | null): Promise<AuthUser | null> {
  if (!token || token.length < 32) return null;
  const result = await rows<UserRow[]>(`select u.id,u.email,u.display_name,u.role,u.must_change_password,s.id session_id
    from sessions s join users u on u.id=s.user_id
    where s.token_hash=? and s.expires_at>now(3) and s.logged_out_at is null and s.revoked_at is null and u.active=1 limit 1`, [tokenHash(token)]);
  const row = result[0];
  if (row) await db.execute("update sessions set last_seen_at=now(3) where id=?",[row.session_id]);
  return row ? { id:row.id, email:row.email, displayName:row.display_name, role:row.role, mustChangePassword:Boolean(row.must_change_password) } : null;
}

export function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : request.cookies.get(SESSION_COOKIE)?.value || null;
}
export async function requestUser(request: NextRequest) { return userForToken(bearerToken(request)); }
export async function currentUser() { return userForToken((await cookies()).get(SESSION_COOKIE)?.value || null); }

export function secureCookie(token: string, expires: Date) {
  return { name:SESSION_COOKIE, value:token, httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"strict" as const, path:"/", expires };
}

export function passwordIsStrong(value: string) {
  return value.length >= 12 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

export function constantTimeEqual(left: string, right: string) {
  const a=Buffer.from(left); const b=Buffer.from(right); return a.length === b.length && timingSafeEqual(a,b);
}
