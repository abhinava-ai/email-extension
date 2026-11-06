"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, LoaderCircle } from "lucide-react";

type Details = { purpose: "invite" | "reset"; email: string; displayName: string };

export function SetPasswordForm() {
  const router = useRouter();
  const token = useRef("");
  const [status, setStatus] = useState<"checking" | "invalid" | "ready">("checking");
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
      // Keeps the secret out of browser history and anything shared from the address bar.
      window.history.replaceState(null, "", window.location.pathname);
      try {
        const response = await fetch("/api/auth/account-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }) });
        if (!response.ok) throw new Error("invalid");
        setDetails(await response.json());
        setStatus("ready");
      } catch {
        setStatus("invalid");
      }
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/set-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current, password: data.get("password") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save your password.");
      router.replace("/dashboard");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? "Could not reach the server. Try again." : failure instanceof Error ? failure.message : "Could not save your password.");
      setBusy(false);
    }
  }

  if (status === "checking") return <section className="auth-panel"><LoaderCircle className="spin" size={22} /><p>Checking your link</p></section>;
  if (status === "invalid") {
    return (
      <section className="auth-panel">
        <span className="auth-panel-icon" aria-hidden="true"><KeyRound size={21} /></span>
        <h2>This link no longer works</h2>
        <p>Links work once and expire. Ask your administrator for a new invitation, or request a new password reset.</p>
        <Link className="button button-primary button-wide" href="/forgot-password">Request a new link</Link>
        <p className="auth-switch"><Link className="text-link" href="/login">Back to sign in</Link></p>
      </section>
    );
  }
  const invite = details?.purpose === "invite";
  return (
    <section className="auth-panel">
      <span className="auth-panel-icon" aria-hidden="true"><KeyRound size={21} /></span>
      <h2>{invite ? `Welcome, ${details?.displayName}` : "Choose a new password"}</h2>
      <p>{invite ? "Choose a password to join the template workspace." : "Your old password stops working once you save this one."}</p>
      <form className="form-stack" onSubmit={submit}>
        <input type="email" name="username" autoComplete="username" value={details?.email || ""} readOnly hidden />
        <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" autoFocus required /></div>
        <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div>
        <div className="password-requirements" aria-label="Password requirements">
          <span><Check size={14} />At least 12 characters</span>
          <span><Check size={14} />Uppercase and lowercase letters</span>
          <span><Check size={14} />At least one number</span>
        </div>
        {error && <div className="form-message" role="alert">{error}</div>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} />Saving</> : invite ? "Join workspace" : "Save new password"}</button>
      </form>
    </section>
  );
}
