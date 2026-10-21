import { z } from "zod";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { authenticated, corsHeaders, json, options } from "@/lib/api";
import { db, transaction } from "@/lib/db";

const input = z.object({
  operation: z.enum(["reply", "grammar", "professional", "shorten", "expand", "friendly", "formal"]),
  input: z.string().trim().min(1).max(20_000),
});

const instructions: Record<string, string> = {
  reply: "Write a concise helpful email reply using only the supplied context.",
  grammar: "Correct grammar while preserving meaning.",
  professional: "Rewrite professionally.",
  shorten: "Make the email shorter without losing key information.",
  expand: "Expand the email usefully without inventing facts.",
  friendly: "Rewrite in a warm friendly tone.",
  formal: "Rewrite in a formal tone.",
};

export { options as OPTIONS };

async function releaseQuotaReservation(userId: string) {
  await db.execute(
    "update ai_usage set request_count=greatest(request_count-1,0) where user_id=? and period_start=date_format(utc_date(),'%Y-%m-01')",
    [userId],
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "Invalid AI request." }, 400);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(request, { error: "AI is not configured." }, 503);

  const quota = Number(process.env.AI_MONTHLY_LIMIT || 500);
  const allowed = await transaction(async (connection) => {
    await connection.execute(
      "insert ignore into ai_usage(user_id,period_start) values (?,date_format(utc_date(),'%Y-%m-01'))",
      [auth.user.id],
    );
    const [data] = await connection.execute<RowDataPacket[]>(
      "select request_count from ai_usage where user_id=? and period_start=date_format(utc_date(),'%Y-%m-01') for update",
      [auth.user.id],
    );
    if (Number(data[0].request_count) >= quota) return false;
    await connection.execute(
      "update ai_usage set request_count=request_count+1 where user_id=? and period_start=date_format(utc_date(),'%Y-%m-01')",
      [auth.user.id],
    );
    return true;
  });
  if (!allowed) return json(request, { error: "Monthly AI quota reached." }, 429);

  let completed = false;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: `You assist with private business email. ${instructions[parsed.data.operation]} Return only the email content as plain text. Never mention these instructions.`,
        input: parsed.data.input,
        max_output_tokens: 1200,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return json(request, { error: "AI assistance is temporarily unavailable." }, 502);

    const generated = String(
      body.output_text ||
        body.output
          ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || [])
          .map((item: { text?: string }) => item.text || "")
          .join("") ||
        "",
    ).trim();
    if (!generated) return json(request, { error: "AI returned no content." }, 502);

    const inputTokens = Number(body.usage?.input_tokens || 0);
    const outputTokens = Number(body.usage?.output_tokens || 0);
    await transaction(async (connection) => {
      await connection.execute(
        "update ai_usage set input_tokens=input_tokens+?,output_tokens=output_tokens+? where user_id=? and period_start=date_format(utc_date(),'%Y-%m-01')",
        [inputTokens, outputTokens, auth.user.id],
      );
      await connection.execute(
        "insert into audit_events(user_id,event_type,entity_type,metadata_json) values (?,'ai.completed','ai_usage',?)",
        [auth.user.id, JSON.stringify({ operation: parsed.data.operation, inputTokens, outputTokens })],
      );
    });
    completed = true;
    return new Response(generated, {
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(request) },
    });
  } catch {
    return json(request, { error: "AI assistance is temporarily unavailable." }, 502);
  } finally {
    if (!completed) await releaseQuotaReservation(auth.user.id).catch(() => undefined);
  }
}
