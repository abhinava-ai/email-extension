import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  return <AuthShell><AuthForm /></AuthShell>;
}
