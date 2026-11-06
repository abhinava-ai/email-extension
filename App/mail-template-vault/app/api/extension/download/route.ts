import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { authenticated, json } from "@/lib/api";

// Kept outside public/, because Hostinger serves that folder without reaching the app's sign-in checks.
const PACKAGE_FILE = path.join(process.cwd(), "private", "mail-template-vault-extension.zip");

export async function GET(request: NextRequest) {
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  try {
    const file = await readFile(PACKAGE_FILE);
    return new Response(file, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="mail-template-vault-extension.zip"',
        "Content-Length": String(file.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return json(request, { error: "The extension package is not available yet." }, 404);
  }
}
