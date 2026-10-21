"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
export function SignOutButton(){const router=useRouter();return <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});router.replace("/login");router.refresh();}}><LogOut size={18}/></button>}
