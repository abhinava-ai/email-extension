import Link from "next/link";
import { ArrowRight, Bot, Download, FileText, Laptop, Sparkles } from "lucide-react";
import { getCurrentAiUsage } from "@/lib/entitlements";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { entitlements, used } = await getCurrentAiUsage();
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow" style={{ color: "#4e7467" }}>Workspace overview</p><h1>Good to have you here.</h1><p>Your account is ready. Install the extension to start building a reusable library for Outlook.</p></div></div>
    <section className="grid grid-3" aria-label="Account statistics">
      <div className="card stat-card"><div className="stat-top"><span>Saved templates</span><span className="stat-icon"><FileText size={17} /></span></div><div><div className="stat-value">0</div><div className="stat-note">Ready for your first template</div></div></div>
      <div className="card stat-card"><div className="stat-top"><span>Connected devices</span><span className="stat-icon"><Laptop size={17} /></span></div><div><div className="stat-value">0</div><div className="stat-note">No devices connected yet</div></div></div>
      <div className="card stat-card"><div className="stat-top"><span>AI assists this month</span><span className="stat-icon"><Bot size={17} /></span></div><div><div className="stat-value">{used} <small style={{ font: "700 .8rem var(--font-sans)" }}>/ {entitlements.aiMonthlyLimit}</small></div><div className="stat-note">{entitlements.plan} plan • resets monthly</div></div></div>
    </section>
    <section className="section-title"><h2>Next step</h2></section>
    <div className="card hero-card"><p className="eyebrow">Chrome extension</p><h2>Bring your best replies into Outlook.</h2><p>Install Mail Template Vault, pin it to your browser, then open the side panel while composing an email.</p><Link className="button" href="/install"><Download size={17} />View installation guide</Link></div>
    <section className="section-title"><h2>Workspace activity</h2><Link className="text-link" href="/usage">View usage <ArrowRight size={14} style={{ verticalAlign: "-2px" }} /></Link></section>
    <div className="card empty-card"><span className="empty-icon"><Sparkles size={23} /></span><h2>Activity will appear here</h2><p>Template syncs, AI assists, and new devices will show up once you begin using the extension.</p></div>
  </div>;
}
