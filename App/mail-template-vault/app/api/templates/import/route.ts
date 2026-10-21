import { z } from "zod";
import type { NextRequest } from "next/server";
import { authenticated,json,options } from "@/lib/api";
import { cleanTemplateHtml } from "@/lib/templates";
import { transaction } from "@/lib/db";
const input=z.object({templates:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,100}$/i),name:z.string().trim().min(1).max(80),html:z.string().max(500000)})).max(500)});
export { options as OPTIONS };
export async function POST(request:NextRequest){const auth=await authenticated(request);if("response" in auth)return auth.response;const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json(request,{error:"Invalid template backup."},400);const clean=parsed.data.templates.map(t=>({...t,html:cleanTemplateHtml(t.html)}));let imported=0;await transaction(async connection=>{for(const t of clean){const [result]=await connection.execute("insert ignore into templates(id,name,html,created_by,updated_by) values (?,?,?,?,?)",[t.id,t.name,t.html,auth.user.id,auth.user.id]);imported+=(result as {affectedRows:number}).affectedRows;}});return json(request,{imported});}
