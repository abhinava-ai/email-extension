import type { NextRequest } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { authenticated, json, options } from "@/lib/api";
import { db, rows } from "@/lib/db";
export { options as OPTIONS };
type OwnerRow=RowDataPacket&{user_id:string};
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){const auth=await authenticated(request);if("response" in auth)return auth.response;const{id}=await params;const found=await rows<OwnerRow[]>("select user_id from sessions where id=? limit 1",[id]);if(!found[0])return json(request,{error:"Device session not found."},404);if(auth.user.role!=="admin"&&found[0].user_id!==auth.user.id)return json(request,{error:"Not allowed."},403);const[result]=await db.execute<ResultSetHeader>("update sessions set revoked_at=coalesce(revoked_at,now(3)) where id=? and revoked_at is null",[id]);if(result.affectedRows)await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)",[auth.user.id,"device.removed","session",id]);return json(request,{ok:true});}
