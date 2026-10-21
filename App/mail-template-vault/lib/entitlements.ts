import type { RowDataPacket } from "mysql2";
import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";
export type Entitlements={version:1;plan:"Private";templateLimit:null;aiMonthlyLimit:number;chromeSync:false;richEditor:true;validatedAt:number};
export async function getMyEntitlements():Promise<Entitlements>{return{version:1,plan:"Private",templateLimit:null,aiMonthlyLimit:Number(process.env.AI_MONTHLY_LIMIT||500),chromeSync:false,richEditor:true,validatedAt:Date.now()};}
type UsageRow=RowDataPacket&{request_count:number};
export async function getCurrentAiUsage(){const entitlements=await getMyEntitlements();const user=await currentUser();if(!user)return{entitlements,used:0,periodEnd:null};const data=await rows<UsageRow[]>("select request_count from ai_usage where user_id=? and period_start=date_format(utc_date(),'%Y-%m-01')",[user.id]);return{entitlements,used:data[0]?.request_count||0,periodEnd:null};}
