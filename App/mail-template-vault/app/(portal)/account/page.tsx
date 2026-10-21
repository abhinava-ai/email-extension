import { Check, ShieldCheck } from "lucide-react";
import { getMyEntitlements } from "@/lib/entitlements";
export const metadata = { title: "Account & plan" };
export default async function AccountPage() {
  const access = await getMyEntitlements();
  return <div className="page"><div className="page-heading"><div><h1>Account & plan</h1><p>Manage your profile, security, and product access.</p></div></div>
    <div className="grid grid-2">
      <section className="card"><h2>Profile</h2><div className="details"><div className="detail-row"><span className="detail-label">Email</span><span className="detail-value">Your signed-in email</span><button className="button button-secondary">Change</button></div><div className="detail-row"><span className="detail-label">Password</span><span className="detail-value">Protected with Supabase Auth</span><button className="button button-secondary">Reset</button></div></div></section>
      <section className="card"><h2>Current access</h2><div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "start" }}><div><div className="stat-value">{access.plan}</div><p style={{ margin: "8px 0" }}>Private Abhinava workspace backed by MySQL.</p></div><span className="status">Active</span></div><div className="divider" /><div className="list"><div className="list-row"><span className="list-icon"><Check size={18} /></span><div className="list-copy"><strong>Unlimited shared templates</strong><span>Rich editor included</span></div></div><div className="list-row"><span className="list-icon"><Check size={18} /></span><div className="list-copy"><strong>{access.aiMonthlyLimit} monthly AI generations</strong><span>Available to authenticated members</span></div></div></div><p style={{ fontSize: ".8rem" }}>Members are created manually. Public registration is disabled.</p></section>
    </div>
    <section className="section-title"><h2>Security</h2></section><div className="callout"><ShieldCheck size={22} /><div><strong>Your credentials stay private</strong><p>The portal uses a publishable Supabase key. Privileged service credentials are never shipped to the browser.</p></div></div>
  </div>;
}
