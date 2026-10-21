import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { currentUser } from "@/lib/auth";
export default async function PortalLayout({children}:{children:React.ReactNode}){const user=await currentUser();if(!user)redirect("/login");if(user.mustChangePassword)redirect("/change-password");return <PortalShell email={user.email}>{children}</PortalShell>}
