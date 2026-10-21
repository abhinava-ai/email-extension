import { Mail } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-label="Mail Template Vault">
        <div className="brand-lockup"><span className="brand-mark"><Mail size={19} /></span>Mail Template Vault</div>
        <div className="auth-story">
          <p className="eyebrow">Your writing system, everywhere</p>
          <h1>Write once.<br />Send with confidence.</h1>
          <p>Keep your best Outlook replies organized, available across devices, and ready when the right words matter.</p>
        </div>
        <p className="auth-note">Built for focused teams and independent professionals.</p>
      </section>
      <section className="auth-main">{children}</section>
    </main>
  );
}
