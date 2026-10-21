"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, CreditCard, Download, FileText, LayoutDashboard, Mail } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/account", label: "Account & plan", icon: CreditCard },
  { href: "/usage", label: "AI usage", icon: BarChart3 },
  { href: "/install", label: "Install extension", icon: Download },
];

export function PortalShell({ children, email = "account@example.com" }: { children: React.ReactNode; email?: string }) {
  const pathname = usePathname();
  const current = navigation.find((item) => pathname.startsWith(item.href));
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <div className="portal">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand-lockup"><span className="brand-mark"><Mail size={19} /></span>Mail Template Vault</Link>
        <nav className="nav" aria-label="Portal navigation">
          <p className="nav-label">Workspace</p>
          {navigation.map(({ href, label, icon: Icon }) => <Link key={href} className={`nav-link${pathname.startsWith(href) ? " active" : ""}`} href={href}><Icon size={18} />{label}</Link>)}
        </nav>
        <div className="sidebar-footer"><div className="user-mini"><span className="avatar">{initials}</span><div><strong>Your workspace</strong><span>{email}</span></div></div></div>
      </aside>
      <main className="portal-main">
        <header className="topbar"><span className="topbar-title">{current?.label ?? "Portal"}</span><div className="topbar-actions"><Link className="button button-secondary" href="/install"><Download size={16} />Get extension</Link><button className="icon-button" aria-label="Notifications"><Bell size={18} /></button><SignOutButton /></div></header>
        <nav className="mobile-nav" aria-label="Mobile portal navigation">{navigation.map(({ href, label }) => <Link key={href} className={pathname.startsWith(href) ? "active" : ""} href={href}>{label}</Link>)}</nav>
        {children}
      </main>
    </div>
  );
}
