import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { appOrigin, ensureAccountTokens, sendAccountLink } from "@/lib/account-tokens";
import { authenticated, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { newMemberInput } from "@/lib/team";

type ExistingRow = RowDataPacket & { id: string };

export async function POST(request: NextRequest) {
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "admin") return json(request, { error: "Only administrators can add members." }, 403);
  const parsed = newMemberInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "Enter a name and a valid email address." }, 400);
  const { email, displayName, role } = parsed.data;
  try {
    // Checked first, so a setup problem cannot leave behind a member with no way in.
    appOrigin();
    await ensureAccountTokens();
  } catch (error) {
    console.error("Invitations are not ready:", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Invitations are not set up on the server yet. Check APP_ORIGIN and database access." }, 500);
  }
  const existing = await rows<ExistingRow[]>("select id from users where email=? limit 1", [email]);
  if (existing[0]) return json(request, { error: "Someone with this email is already in the workspace." }, 409);
  const id = randomUUID();
  // Nobody knows this password. The member sets their own through the invitation link.
  await db.execute("insert into users(id,email,display_name,password_hash,role,must_change_password,active) values (?,?,?,?,?,1,1)", [id, email, displayName, await hashPassword(randomBytes(32).toString("base64url")), role]);
  await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)", [auth.user.id, "team.member_added", "user", id]);
  const { emailSent, link } = await sendAccountLink({ id, email, displayName }, "invite", auth.user.id, auth.user.displayName);
  // The link only comes back when the email could not carry it.
  const response = json(request, { id, emailSent, link: emailSent ? undefined : link }, 201);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
