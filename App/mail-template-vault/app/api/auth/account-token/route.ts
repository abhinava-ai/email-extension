import { z } from "zod";
import type { NextRequest } from "next/server";
import { findAccountToken } from "@/lib/account-tokens";
import { json } from "@/lib/api";

const input = z.object({ token: z.string().min(32).max(100) });

// Tells the set-password page who the link is for, and whether it still works.
export async function POST(request: NextRequest) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  const found = parsed.success ? await findAccountToken(parsed.data.token).catch(() => null) : null;
  if (!found) return json(request, { error: "This link has expired or has already been used." }, 400);
  return json(request, { purpose: found.purpose, email: found.email, displayName: found.display_name });
}
