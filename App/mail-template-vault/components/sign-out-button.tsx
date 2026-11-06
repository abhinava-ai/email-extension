"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed.");
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const label = failed ? "Could not sign out. Try again." : "Sign out";
  return (
    <button className={`icon-button${failed ? " danger" : ""}`} title={label} aria-label={label} disabled={busy} onClick={signOut}>
      {busy ? <LoaderCircle size={18} className="spin" /> : <LogOut size={18} />}
    </button>
  );
}
