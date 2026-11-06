import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/set-password-form";

export const metadata = { title: "Choose a password", robots: { index: false, follow: false } };

export default function SetPasswordPage() {
  return <AuthShell><SetPasswordForm /></AuthShell>;
}
