import { Check, ShieldCheck } from "lucide-react";
export const metadata = { title: "Account & plan" };
export default function AccountPage() {
  return <div className="page"><div className="page-heading"><div><h1>Account & plan</h1><p>Manage your profile, security, and product access.</p></div></div>
    <div className="grid grid-2">
      <section className="card"><h2>Profile</h2><div className="details"><div className="detail-row"><span className="detail-label">Email</span><span className="detail-value">Your signed-in email</span></div><div className="detail-row"><span className="detail-label">Password</span><span className="detail-value">Protected by the private account service</span></div></div></section>
      <section className="card"><h2>Current access</h2><div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "start" }}><div><div className="stat-value">Private</div><p style={{ margin: "8px 0" }}>Private Abhinava workspace backed by MySQL.</p></div><span className="status">Active</span></div><div className="divider" /><div className="list"><div className="list-row"><span className="list-icon"><Check size={18} /></span><div className="list-copy"><strong>Unlimited shared templates</strong><span>Rich editor included</span></div></div><div className="list-row"><span className="list-icon"><Check size={18} /></span><div className="list-copy"><strong>Outlook template insertion</strong><span>Available to authenticated members</span></div></div></div><p style={{ fontSize: ".8rem" }}>Members are created manually. Public registration is disabled.</p></section>
    </div>
    <section className="section-title"><h2>Security</h2></section><div className="callout"><ShieldCheck size={22} /><div><strong>Your credentials stay private</strong><p>Database credentials remain on the server and are never shipped to the browser or extension.</p></div></div>
  </div>;
}
