const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'functions', 'ai-email', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '202609220003_ai_email_quota.sql'), 'utf8');

test('ai-email requires authenticated context and validates its strict operation set', () => {
  assert.match(edge, /createSupabaseContext\(request, \{ auth: "user" \}\)/);
  for (const operation of ['reply', 'grammar', 'professional', 'shorten', 'expand', 'friendly', 'formal']) {
    assert.match(edge, new RegExp(`\\b${operation}:`));
  }
  assert.match(edge, /MAX_INPUT_LENGTH = 12_000/);
  assert.match(edge, /Unexpected payload field/);
});

test('OpenAI key is read only from Edge Function secrets and output is plain text', () => {
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(edge, /OPENAI_API_KEY\s*=\s*["'][^"']+/);
  assert.match(edge, /openai\.responses\.create/);
  assert.match(edge, /DEFAULT_MODEL = "gpt-5-mini"/);
  assert.match(edge, /"Content-Type": "text\/plain; charset=utf-8"/);
});

test('quota and usage functions are auth-scoped and accept no email content', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /request_count < request_quota/);
  assert.match(migration, /grant execute[^;]+to authenticated/gs);
  assert.doesNotMatch(migration, /\b(email_content|thread_content|prompt|generated_content)\b/i);
  assert.match(migration, /'input_tokens'/);
  assert.match(migration, /'output_tokens'/);
  assert.match(migration, /'provider_request_id'/);
});
