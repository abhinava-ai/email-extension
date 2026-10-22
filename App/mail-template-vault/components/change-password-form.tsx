"use client";

import { useState, type FormEvent } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("The new passwords do not match.");
      setBusy(false);
      return;
    }
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Could not change password.");
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className="auth-panel">
      <span className="auth-panel-icon" aria-hidden="true"><KeyRound size={21} /></span>
      <p className="eyebrow auth-eyebrow">Account security</p>
      <h2>Choose a new password</h2>
      <p>Replace the temporary password before entering your private template workspace.</p>

      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="current-password">Current temporary password</label>
          <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input id="new-password" name="newPassword" type="password" minLength={12} autoComplete="new-password" required />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required />
        </div>

        <div className="password-requirements" aria-label="Password requirements">
          <span><Check size={14} />At least 12 characters</span>
          <span><Check size={14} />Uppercase and lowercase letters</span>
          <span><Check size={14} />At least one number</span>
        </div>

        {error && <div className="form-message" role="alert">{error}</div>}
        <button className="button button-primary button-wide" disabled={busy}>
          {busy ? <><LoaderCircle className="spin" size={17} />Saving password…</> : "Change password"}
        </button>
      </form>
    </section>
  );
}
