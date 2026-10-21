import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
export default async function ChangePasswordPage(){const user=await currentUser();if(!user)redirect("/login");if(!user.mustChangePassword)redirect("/dashboard");return <main className="auth-page"><ChangePasswordForm/></main>}
