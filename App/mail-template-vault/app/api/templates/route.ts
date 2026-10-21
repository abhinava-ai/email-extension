import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { authenticated, json, options } from "@/lib/api";
import { cleanTemplateHtml } from "@/lib/templates";
import { db, rows } from "@/lib/db";
const input=z.object({id:z.string().regex(/^[a-z0-9_-]{1,100}$/i).optional(),name:z.string().trim().min(1).max(80),html:z.string().max(500000)});
type TemplateRow=RowDataPacket&{id:string;name:string;html:string;version:number;created_at:Date;updated_at:Date;updated_by_email:string};
const shape=(r:TemplateRow)=>({id:r.id,name:r.name,html:r.html,serverVersion:r.version,createdAt:new Date(r.created_at).getTime(),updatedAt:new Date(r.updated_at).getTime(),updatedBy:r.updated_by_email});
export { options as OPTIONS };
export async function GET(request:NextRequest){const auth=await authenticated(request);if("response" in auth)return auth.response;const list=await rows<TemplateRow[]>(`select t.id,t.name,t.html,t.version,t.created_at,t.updated_at,u.email updated_by_email from templates t join users u on u.id=t.updated_by where t.deleted_at is null order by t.name`,[]);return json(request,{templates:list.map(shape)});}
export async function POST(request:NextRequest){const auth=await authenticated(request);if("response" in auth)return auth.response;const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json(request,{error:"Invalid template."},400);let html;try{html=cleanTemplateHtml(parsed.data.html);}catch(e){return json(request,{error:e instanceof Error?e.message:"Invalid template."},400);}const id=parsed.data.id||randomUUID();await db.execute("insert into templates(id,name,html,created_by,updated_by) values (?,?,?,?,?)",[id,parsed.data.name,html,auth.user.id,auth.user.id]);await db.execute("insert into audit_events(user_id,event_type,entity_type,entity_id) values (?,?,?,?)",[auth.user.id,"template.created","template",id]);const found=await rows<TemplateRow[]>(`select t.id,t.name,t.html,t.version,t.created_at,t.updated_at,u.email updated_by_email from templates t join users u on u.id=t.updated_by where t.id=?`,[id]);return json(request,{template:shape(found[0])},201);}
