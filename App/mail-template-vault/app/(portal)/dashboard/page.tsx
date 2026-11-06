import Link from "next/link";
import { Download, FileText, Laptop, Sparkles } from "lucide-react";
import type { RowDataPacket } from "mysql2";
import { rows } from "@/lib/db";

export const metadata = { title: "Overview" };

type CountRow = RowDataPacket & { count: number };
type ActivityRow = RowDataPacket & { event_type: string; email: string | null; created_at: Date };

const ACTIVITY_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_changed": "Changed password",
  "template.created": "Created a template",
  "template.updated": "Updated a template",
  "template.deleted": "Deleted a template",
  "device.logged_out": "Logged out a device",
  "device.removed": "Removed a device",
};

function activityLabel(eventType: string) {
  const label = ACTIVITY_LABELS[eventType] || eventType.replaceAll(/[._]/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function DashboardPage() {
  const [templateRows, deviceRows, activity] = await Promise.all([
    rows<CountRow[]>("select count(*) count from templates where deleted_at is null"),
    rows<CountRow[]>("select count(*) count from sessions where expires_at>now(3) and logged_out_at is null and revoked_at is null"),
    rows<ActivityRow[]>("select a.event_type,u.email,a.created_at from audit_events a left join users u on u.id=a.user_id order by a.created_at desc limit 8"),
  ]);
  const templateCount = Number(templateRows[0]?.count || 0);
  const deviceCount = Number(deviceRows[0]?.count || 0);
  return (
    <div className="page">
      <div className="page-heading"><div><h1>Good to have you here.</h1><p>Manage your shared templates here, then insert them from Outlook with the Chrome extension.</p></div></div>
      <section className="grid grid-3" aria-label="Account statistics">
        <Link className="card stat-card card-link" href="/templates"><div className="stat-top"><span>Saved templates</span><span className="stat-icon"><FileText size={17} /></span></div><div><div className="stat-value">{templateCount}</div><div className="stat-note">Shared dashboard library</div></div></Link>
        <Link className="card stat-card card-link" href="/devices"><div className="stat-top"><span>Active sessions</span><span className="stat-icon"><Laptop size={17} /></span></div><div><div className="stat-value">{deviceCount}</div><div className="stat-note">View device history</div></div></Link>
        <div className="card stat-card"><div className="stat-top"><span>Workspace access</span><span className="stat-icon"><Sparkles size={17} /></span></div><div><div className="stat-value">Private</div><div className="stat-note">Shared template library</div></div></div>
      </section>
      <section className="section-title"><h2>Next step</h2></section>
      <div className="card hero-card"><p className="eyebrow">Chrome extension</p><h2>Bring your best replies into Outlook.</h2><p>Install Mail Template Vault and pin it to your browser. Then use it as a side panel, a popover or a picker inside your email, whichever you prefer.</p><Link className="button" href="/install"><Download size={17} />View installation guide</Link></div>
      <section className="section-title"><h2>Workspace activity</h2></section>
      {activity.length ? (
        <div className="card"><div className="list">{activity.map((item, index) => (
          <div className="list-row" key={`${item.event_type}-${new Date(item.created_at).getTime()}-${index}`}>
            <span className="list-icon"><Sparkles size={17} /></span>
            <div className="list-copy"><strong>{activityLabel(item.event_type)}</strong><span>{item.email || "System"} · {new Date(item.created_at).toLocaleString()}</span></div>
          </div>
        ))}</div></div>
      ) : (
        <div className="card empty-card"><span className="empty-icon"><Sparkles size={23} /></span><h2>Activity will appear here</h2><p>Template updates and device sessions will show up here.</p></div>
      )}
    </div>
  );
}
