"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Monitor, Smartphone, Trash2 } from "lucide-react";
import { useConfirm } from "./confirm-dialog";

export type DeviceRecord = { id:string; email:string; displayName:string; role:string; client:"web"|"extension"; browser:string; system:string; ipAddress:string; status:string; createdAt:string; lastSeenAt:string; expiresAt:string };

export function DeviceHistory({ devices }:{ devices:DeviceRecord[] }) {
  const router=useRouter(); const[working,setWorking]=useState(""); const[message,setMessage]=useState(""); const{confirm,dialog}=useConfirm();
  async function action(id:string,kind:"logout"|"remove"){
    const confirmed=await confirm(kind==="logout"?{title:"Log out this device?",message:"This session will end and the device will need to sign in again.",confirmLabel:"Log out"}:{title:"Remove this device?",message:"It will be signed out and will have to sign in again.",confirmLabel:"Remove",danger:true});
    if(!confirmed)return;setWorking(`${kind}:${id}`);setMessage("");
    try{const response=await fetch(`/api/devices/${id}`,{method:kind==="logout"?"POST":"DELETE"});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`Could not ${kind} device.`);router.refresh();}
    catch(error){setMessage(error instanceof Error?error.message:`Could not ${kind} device.`);}finally{setWorking("");}
  }
  if(!devices.length)return <div className="card empty-card"><span className="empty-icon"><Monitor size={24}/></span><h2>No device history yet</h2><p>Web and extension sessions will appear after the next login.</p></div>;
  return <div className="card device-card">{dialog}{message&&<div className="form-message" role="alert">{message}</div>}<div className="device-table" role="table" aria-label="Device and session history">
    <div className="device-row device-head" role="row"><span>User</span><span>Device</span><span>Access</span><span>Activity</span><span>Status</span><span></span></div>
    {devices.map(device=><div className="device-row" role="row" key={device.id}>
      <div className="device-user"><strong>{device.displayName}</strong><span>{device.email}</span><small>{device.role}</small></div>
      <div className="device-detail"><span className="device-icon">{/android|ios|iphone|ipad/i.test(device.system)?<Smartphone size={17}/>:<Monitor size={17}/>}</span><div><strong>{device.browser}</strong><span>{device.system}{device.ipAddress?` • ${device.ipAddress}`:""}</span></div></div>
      <div><strong>{device.client==="extension"?"Outlook extension":"Web dashboard"}</strong></div>
      <div className="device-dates"><span>Last active {new Date(device.lastSeenAt).toLocaleString()}</span><span>Login {new Date(device.createdAt).toLocaleString()}</span></div>
      <div><span className={`session-status ${device.status.toLowerCase().replaceAll(" ","-")}`}>{device.status}</span></div>
      <div className="device-actions">
        {device.status==="Active"&&<button className="icon-button" title="Log out device" aria-label={`Log out ${device.browser} for ${device.email}`} disabled={Boolean(working)} onClick={()=>action(device.id,"logout")}><LogOut size={16}/></button>}
        {device.status!=="Removed"&&<button className="icon-button danger" title="Remove device" aria-label={`Remove ${device.browser} for ${device.email}`} disabled={Boolean(working)} onClick={()=>action(device.id,"remove")}><Trash2 size={16}/></button>}
      </div>
    </div>)}
  </div></div>;
}
