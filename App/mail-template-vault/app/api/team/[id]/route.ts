import type { NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { authenticated, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberUpdateInput, temporaryPassword } from "@/lib/team";

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
  if (id === auth.user.id && change.action !== "reset_password") return json(request, { error: "You cannot change your own role or access." }, 400);
  if (id === auth.user.id) return json(request, { error: "Use Account & plan to change your own password." }, 400);

  let temporary: string | undefined;
  let result: ResultSetHeader;
  if (change.action === "reset_password") {
    temporary = temporaryPassword();
    [result] = await db.execute<ResultSetHeader>("update users set password_hash=?,must_change_password=1 where id=?", [await hashPassword(temporary), id]);
    if (result.affectedRows) await endSessions(id);
  } else if (change.action === "set_role") {
    [result] = await db.execute<ResultSetHeader>("update users set role=? where id=?", [change.role, id]);
  } else {
    [result] = await db.execute<ResultSetHeader>("update users set active=? where id=?", [change.active ? 1 : 0, id]);
    if (result.affectedRows && !change.active) await endSessions(id);
  }
  if (!result.affectedRows) return json(request, { error: "This member no longer exists." }, 404);
  await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)", [auth.user.id, `team.${change.action}`, "user", id]);
  const response = json(request, { ok: true, temporaryPassword: temporary });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
