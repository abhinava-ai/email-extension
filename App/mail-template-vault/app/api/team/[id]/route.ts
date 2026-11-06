import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revokeAccountTokens, sendAccountLink } from "@/lib/account-tokens";
import { authenticated, json } from "@/lib/api";
import { db, rows } from "@/lib/db";
import { memberUpdateInput } from "@/lib/team";

type MemberRow = RowDataPacket & { id: string; email: string; display_name: string; must_change_password: number; active: number };

const endSessions = (id: string) => db.execute("update sessions set revoked_at=coalesce(revoked_at,now(3)) where user_id=? and revoked_at is null", [id]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "admin") return json(request, { error: "Only administrators can manage members." }, 403);
  const { id } = await params;
  const parsed = memberUpdateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "That change is not valid." }, 400);
  const change = parsed.data;
  // The acting administrator always stays an active administrator, so the workspace cannot be locked out.
  if (id === auth.user.id && change.action !== "send_link") return json(request, { error: "You cannot change your own role or access." }, 400);
  if (id === auth.user.id) return json(request, { error: "Use Account & plan to change your own password." }, 400);

  if (change.action === "send_link") {
    const found = await rows<MemberRow[]>("select id,email,display_name,must_change_password,active from users where id=? limit 1", [id]);
    const member = found[0];
    if (!member) return json(request, { error: "This member no longer exists." }, 404);
    if (!member.active) return json(request, { error: "Reactivate this member first." }, 400);
    const pending = Boolean(member.must_change_password);
    let sent;
    try {
      sent = await sendAccountLink({ id: member.id, email: member.email, displayName: member.display_name }, pending ? "invite" : "reset", auth.user.id, auth.user.displayName);
    } catch (error) {
      console.error("Could not create account link:", error instanceof Error ? error.message : "unknown error");
      return json(request, { error: "Invitations are not set up on the server yet. Check APP_ORIGIN and database access." }, 500);
    }
    await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)", [auth.user.id, pending ? "team.invite_resent" : "team.reset_sent", "user", id]);
    const response = json(request, { ok: true, purpose: pending ? "invite" : "reset", emailSent: sent.emailSent, link: sent.emailSent ? undefined : sent.link });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  let result: ResultSetHeader;
  if (change.action === "set_role") {
    [result] = await db.execute<ResultSetHeader>("update users set role=? where id=?", [change.role, id]);
  } else {
    [result] = await db.execute<ResultSetHeader>("update users set active=? where id=?", [change.active ? 1 : 0, id]);
    if (result.affectedRows && !change.active) {
      await endSessions(id);
      await revokeAccountTokens(id).catch(() => {});
    }
  }
  if (!result.affectedRows) return json(request, { error: "This member no longer exists." }, 404);
  await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)", [auth.user.id, `team.${change.action}`, "user", id]);
  return json(request, { ok: true });
}
