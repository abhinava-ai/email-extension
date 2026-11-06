"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

// Only same-site paths are followed, so a crafted link cannot send people elsewhere after sign-in.
function destinationAfterLogin() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export function AuthForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password"), client: "web" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Sign in failed.");
      router.replace(body.user.mustChangePassword ? "/change-password" : destinationAfterLogin());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof TypeError ? "Could not reach the server. Check your connection and try again." : error instanceof Error ? error.message : "Sign in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-panel">
      <h2>Welcome back</h2>
      <p>Sign in to the private Abhinava template workspace.</p>
      <form className="form-stack" onSubmit={submit}>
        <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        {message && <div className="form-message" role="alert">{message}</div>}
        <button className="button button-primary button-wide" type="submit" disabled={loading}>
          {loading ? <><LoaderCircle size={18} className="spin" />Signing in</> : <>Sign in<ArrowRight size={17} /></>}
        </button>
      </form>
      <p className="auth-switch">Accounts are created manually by an administrator.</p>
    </div>
  );
}
