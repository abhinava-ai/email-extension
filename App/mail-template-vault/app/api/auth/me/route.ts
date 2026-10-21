import type { NextRequest } from "next/server";
import { authenticated, json, options } from "@/lib/api";
export { options as OPTIONS };
export async function GET(request:NextRequest){const auth=await authenticated(request,true);return "response" in auth?auth.response:json(request,{user:auth.user});}
