import { z } from "zod";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { issuedRecently, sendAccountLink } from "@/lib/account-tokens";
import { json } from "@/lib/api";
import { rows } from "@/lib/db";

const input = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
type UserRow = RowDataPacket & { id: string; email: string; display_name: string; must_change_password: number };

async function sendIfMember(email: string) {
  const found = await rows<UserRow[]>("select id,email,display_name,must_change_password from users where email=? and active=1 limit 1", [email]);
  const user = found[0];
  if (!user || (await issuedRecently(user.id))) return;
  await sendAccountLink({ id: user.id, email: user.email, displayName: user.display_name }, user.must_change_password ? "invite" : "reset", null);
}

// The same answer, in about the same time, whether or not the address has an account,
// so this page cannot be used to find out who is in the workspace.
export async function POST(request: NextRequest) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "Enter a valid email address." }, 400);
  void sendIfMember(parsed.data.email).catch((error) => console.error("Could not send reset email:", error instanceof Error ? error.message : "unknown error"));
  return json(request, { ok: true });
}
