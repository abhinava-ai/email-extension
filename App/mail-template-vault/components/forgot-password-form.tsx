"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const email = new FormData(event.currentTarget).get("email");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not send the link.");
      setSent(true);
    } catch (failure) {
      setError(failure instanceof TypeError ? "Could not reach the server. Try again." : failure instanceof Error ? failure.message : "Could not send the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="auth-panel-icon" aria-hidden="true"><KeyRound size={21} /></span>
      <h2>Forgot your password?</h2>
      {sent ? (
        <p role="status">If that address has an account, a link to choose a new password is on its way. It expires in 1 hour. If nothing arrives, check your junk folder or ask your administrator.</p>
      ) : (
        <>
          <p>Enter your email and we&apos;ll send you a link to choose a new one.</p>
          <form className="form-stack" onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" autoFocus required /></div>
            {error && <div className="form-message" role="alert">{error}</div>}
            <button className="button button-primary button-wide" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} />Sending</> : "Send reset link"}</button>
          </form>
        </>
      )}
      <p className="auth-switch"><Link className="text-link" href="/login">Back to sign in</Link></p>
    </section>
  );
}
