import OpenAI from "npm:openai";
import { createSupabaseContext } from "npm:@supabase/server";

const MAX_INPUT_LENGTH = 12_000;
const DEFAULT_MODEL = "gpt-5-mini";
const OPERATIONS = {
  reply: "Draft a clear, useful email reply using the provided visible thread context. Return only the reply text.",
  grammar: "Correct grammar, spelling, and punctuation while preserving tone and meaning. Return only the corrected text.",
  professional: "Rewrite the text in a polished professional tone without changing its meaning. Return only the rewritten text.",
  shorten: "Make the text meaningfully shorter while preserving every essential point. Return only the shortened text.",
  expand: "Expand the text with useful clarity and context without inventing facts. Return only the expanded text.",
  friendly: "Rewrite the text in a warm, friendly, natural tone without changing its meaning. Return only the rewritten text.",
  formal: "Rewrite the text in a formal, respectful tone without changing its meaning. Return only the rewritten text.",
} as const;

type Operation = keyof typeof OPERATIONS;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errorResponse(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: cors });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return errorResponse("Method not allowed.", 405);

  const { data: auth, error: authError } = await createSupabaseContext(request, { auth: "user" });
  const userId = auth?.userClaims?.id ?? auth?.jwtClaims?.sub;
  if (authError || !userId) return errorResponse("Authentication required.", 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("Invalid JSON body.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Invalid payload.", 400);
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.some((key) => !["operation", "input"].includes(key))) return errorResponse("Unexpected payload field.", 400);

  const operation = (body as Record<string, unknown>).operation;
  const rawInput = (body as Record<string, unknown>).input;
  if (typeof operation !== "string" || !(operation in OPERATIONS) || typeof rawInput !== "string") {
    return errorResponse("Operation and input are required.", 400);
  }
  const input = rawInput.trim();
  if (!input) return errorResponse("Input cannot be empty.", 400);
  if (input.length > MAX_INPUT_LENGTH) return errorResponse(`Input exceeds ${MAX_INPUT_LENGTH} characters.`, 413);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return errorResponse("AI service is not configured.", 503);
  const model = Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL;

  const { data: reservation, error: quotaError } = await auth.supabase.rpc("reserve_ai_email_request").single();
  if (quotaError) {
    console.error("AI quota reservation failed", { userId, error: quotaError.code });
    return errorResponse("Could not verify AI quota.", 503);
  }
  if (!reservation?.allowed) {
    return errorResponse("Monthly AI quota reached.", 429, {
      used: reservation?.used ?? 0,
      quota: reservation?.quota ?? 0,
      periodEnd: reservation?.period_end,
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.create({
      model,
      instructions: "You are a privacy-conscious email-writing assistant. Follow the requested operation, return only plain email text, do not add commentary, and never claim an email was sent.",
      input: `${OPERATIONS[operation as Operation]}\n\nEmail context:\n${input}`,
      max_output_tokens: 1200,
    });
    const output = response.output_text?.trim();
    if (!output) return errorResponse("AI service returned no content.", 502);

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const { error: usageError } = await auth.supabase.rpc("record_ai_email_usage", {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      operation,
      model,
      provider_request_id: response.id ?? null,
    });
    if (usageError) console.error("AI usage metadata write failed", { userId, operation, model, requestId: response.id, error: usageError.code });
    else console.info("AI email completed", { userId, operation, model, requestId: response.id, inputTokens, outputTokens });

    return new Response(output, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("AI email generation failed", {
      userId,
      operation,
      model,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("AI service is temporarily unavailable.", 502);
  }
});
