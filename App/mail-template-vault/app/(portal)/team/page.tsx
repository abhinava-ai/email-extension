import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { TeamManager, type TeamMember } from "@/components/team-manager";
import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";

export const metadata = { title: "Team" };

type MemberRow = RowDataPacket & { id: string; email: string; display_name: string; role: "admin" | "member"; active: number; must_change_password: number; last_seen: Date | null };

export default async function TeamPage() {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/dashboard");
  const records = await rows<MemberRow[]>("select u.id,u.email,u.display_name,u.role,u.active,u.must_change_password,(select max(s.last_seen_at) from sessions s where s.user_id=u.id) last_seen from users u order by u.active desc,u.display_name");
  const members: TeamMember[] = records.map((item) => ({
    id: item.id,
    email: item.email,
    displayName: item.display_name,
    role: item.role,
    active: Boolean(item.active),
    pendingPassword: Boolean(item.must_change_password),
    lastSeen: item.last_seen ? new Date(item.last_seen).toISOString() : null,
  }));
  return <div className="page"><TeamManager members={members} currentUserId={user.id} /></div>;
}
