import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return <AuthShell><ChangePasswordForm /></AuthShell>;
}
