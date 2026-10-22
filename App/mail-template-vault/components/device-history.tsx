"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone, Trash2 } from "lucide-react";

export type DeviceRecord = { id:string; email:string; displayName:string; role:string; client:"web"|"extension"; browser:string; system:string; ipAddress:string; status:string; createdAt:string; lastSeenAt:string; expiresAt:string };

export function DeviceHistory({ devices }:{ devices:DeviceRecord[] }) {
  const router=useRouter(); const[removing,setRemoving]=useState("");
  async function remove(id:string){if(!confirm("Remove this device session? It will have to sign in again."))return;setRemoving(id);try{const response=await fetch(`/api/devices/${id}`,{method:"DELETE"});if(response.ok)router.refresh();}finally{setRemoving("");}}
  if(!devices.length)return <div className="card empty-card"><span className="empty-icon"><Monitor size={24}/></span><h2>No device history yet</h2><p>Web and extension sessions will appear after the next login.</p></div>;
  return <div className="card device-card"><div className="device-table" role="table" aria-label="Device and session history">
    <div className="device-row device-head" role="row"><span>User</span><span>Device</span><span>Access</span><span>Activity</span><span>Status</span><span></span></div>
    {devices.map(device=><div className="device-row" role="row" key={device.id}>
      <div className="device-user"><strong>{device.displayName}</strong><span>{device.email}</span><small>{device.role}</small></div>
      <div className="device-detail"><span className="device-icon">{device.client==="extension"?<Monitor size={17}/>:<Smartphone size={17}/>}</span><div><strong>{device.browser}</strong><span>{device.system}{device.ipAddress?` • ${device.ipAddress}`:""}</span></div></div>
      <div><strong>{device.client==="extension"?"Outlook extension":"Web dashboard"}</strong></div>
      <div className="device-dates"><span>Last active {new Date(device.lastSeenAt).toLocaleString()}</span><span>Login {new Date(device.createdAt).toLocaleString()}</span></div>
      <div><span className={`session-status ${device.status.toLowerCase().replaceAll(" ","-")}`}>{device.status}</span></div>
      <div>{device.status==="Active"&&<button className="icon-button" title="Remove device" aria-label={`Remove ${device.browser} for ${device.email}`} disabled={removing===device.id} onClick={()=>remove(device.id)}><Trash2 size={16}/></button>}</div>
    </div>)}
  </div></div>;
}
