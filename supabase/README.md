# Supabase backend

This directory contains the versioned PostgreSQL schema and security policies for Mail Template Vault.

## Apply locally

With the Supabase CLI installed and a local project running:

```sh
supabase db reset
```

For a linked hosted project, review the generated diff and then use the normal Supabase migration deployment workflow. Do not paste or commit service-role credentials.

## Authentication configuration

Version 1 uses email/password authentication with email confirmation enabled.

In the Supabase Dashboard:

1. Keep **Confirm email** enabled under Authentication settings.
2. Set the Site URL to the production portal origin.
3. Add development and production `/auth/confirm` URLs to the allowed redirect URLs.
4. Change the **Confirm signup** email template link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

The portal exchanges that one-time token for a cookie-backed session. The schema links application data to `auth.users.id`, so Microsoft OAuth or passkeys can be introduced later without changing table ownership.

## Security model

- RLS is enabled for every public user-owned table.
- `anon` receives no table privileges.
- Profiles and device registrations can be managed only by their owner.
- Subscription, entitlement, AI usage, and audit records are readable only by their owner and are not client-writable.
- Future trusted functions may update server-authoritative records, but privileged credentials must stay in deployment secret storage.
- OpenAI API keys, Supabase service-role keys, prompts, and template bodies must not be stored in these tables or audit metadata.

## AI assistance function

`functions/ai-email` accepts only authenticated Supabase users, atomically reserves monthly quota, and returns `text/plain` for the extension's contextual assistant. Its public endpoint handles CORS preflight itself and validates the user JWT inside every POST request. Email input and generated content are held only in request memory and are never written to PostgreSQL or logs.

Configure provider credentials only in Supabase Edge Function secret storage:

```sh
supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=gpt-5-mini
supabase functions deploy ai-email
```

`OPENAI_API_KEY` must never be placed in extension configuration, Next.js public variables, PostgreSQL, migrations, or committed files.
