import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const metadata = { title: "Sign in" };
export default function LoginPage() { return <AuthShell><AuthForm /></AuthShell>; }
