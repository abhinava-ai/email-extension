"use client";

import { useState, type FormEvent } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm({ voluntary = false }: { voluntary?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setChanged(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("The new passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not change password.");
    } catch (failure) {
      setError(failure instanceof TypeError ? "Could not reach the server. Try again." : failure instanceof Error ? failure.message : "Could not change password.");
      setBusy(false);
      return;
    }
    if (voluntary) {
      form.reset();
      setBusy(false);
      setChanged(true);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className={voluntary ? "card" : "auth-panel"}>
      {!voluntary && <span className="auth-panel-icon" aria-hidden="true"><KeyRound size={21} /></span>}
      {!voluntary && <p className="eyebrow auth-eyebrow">Account security</p>}
      <h2>{voluntary ? "Change password" : "Choose a new password"}</h2>
      <p>{voluntary ? "This signs out your other devices, including the Chrome extension, so they sign in again with the new password." : "Replace the temporary password before entering your private template workspace."}</p>

      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="current-password">{voluntary ? "Current password" : "Current temporary password"}</label>
          <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" autoFocus={!voluntary} required />
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
        {changed && <div className="form-message success" role="status">Password changed.</div>}
        <button className="button button-primary button-wide" disabled={busy}>
          {busy ? <><LoaderCircle className="spin" size={17} />Saving password…</> : "Change password"}
        </button>
      </form>
    </section>
  );
}
