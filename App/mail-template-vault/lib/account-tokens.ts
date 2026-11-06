import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db, rows } from "@/lib/db";
import { sendAccountEmail } from "@/lib/mailer";

export type TokenPurpose = "invite" | "reset";
type TokenRow = RowDataPacket & { id: string; user_id: string; purpose: TokenPurpose; email: string; display_name: string };
type RecentRow = RowDataPacket & { id: string };

const LIFETIME_HOURS: Record<TokenPurpose, number> = { invite: 7 * 24, reset: 1 };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
let tableReady: Promise<unknown> | null = null;

// Hostinger's deploy only builds and starts the app, so the table is created on first use.
// It is also in database/schema.sql for new installs.
export function ensureAccountTokens() {
  tableReady ??= db.execute(`create table if not exists account_tokens (
    id char(36) primary key,
    user_id char(36) not null,
    token_hash char(64) not null unique,
    purpose enum('invite','reset') not null,
    expires_at timestamp(3) not null,
    used_at timestamp(3) null,
    created_by char(36) null,
    created_at timestamp(3) not null default current_timestamp(3),
    constraint account_tokens_user_fk foreign key (user_id) references users(id) on delete cascade,
    index account_tokens_user_idx (user_id, created_at)
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`).catch((error) => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

// From configuration only. A link built from request headers could be pointed at another site.
export function appOrigin() {
  const origin = (process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(origin)) throw new Error("APP_ORIGIN is not configured.");
  return origin;
}

export async function revokeAccountTokens(userId: string) {
  await ensureAccountTokens();
  await db.execute("update account_tokens set used_at=now(3) where user_id=? and used_at is null", [userId]);
}

async function issueToken(userId: string, purpose: TokenPurpose, createdBy: string | null) {
  await revokeAccountTokens(userId);
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + LIFETIME_HOURS[purpose] * 3600000);
  await db.execute("insert into account_tokens(id,user_id,token_hash,purpose,expires_at,created_by) values (?,?,?,?,?,?)", [randomUUID(), userId, hashToken(token), purpose, expires, createdBy]);
  return token;
}

// The fragment after # never reaches a server, so the token stays out of logs and CDN records.
export const accountLink = (token: string) => `${appOrigin()}/set-password#token=${token}`;

type Recipient = { id: string; email: string; displayName: string };

export async function sendAccountLink(user: Recipient, purpose: TokenPurpose, createdBy: string | null, invitedBy?: string) {
  const link = accountLink(await issueToken(user.id, purpose, createdBy));
  const emailSent = await sendAccountEmail({ to: user.email, name: user.displayName, purpose, link, invitedBy });
  return { emailSent, link };
}

export async function issuedRecently(userId: string) {
  await ensureAccountTokens();
  const found = await rows<RecentRow[]>("select id from account_tokens where user_id=? and created_at>now(3)-interval 1 minute limit 1", [userId]);
  return Boolean(found[0]);
}

export async function findAccountToken(token: string) {
  if (typeof token !== "string" || token.length < 32 || token.length > 100) return null;
  await ensureAccountTokens();
  const found = await rows<TokenRow[]>("select t.id,t.user_id,t.purpose,u.email,u.display_name from account_tokens t join users u on u.id=t.user_id where t.token_hash=? and t.used_at is null and t.expires_at>now(3) and u.active=1 limit 1", [hashToken(token)]);
  return found[0] || null;
}

// Only one request can ever use a token, even if two arrive together.
export async function consumeAccountToken(id: string) {
  const [result] = await db.execute<ResultSetHeader>("update account_tokens set used_at=now(3) where id=? and used_at is null", [id]);
  return result.affectedRows === 1;
}
