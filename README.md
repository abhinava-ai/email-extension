# Mail Template Vault for Outlook

Private product repository for the Mail Template Vault Chrome extension, Next.js application, MySQL backend, and product documentation.

## Repository structure

```text
Extension/                 Existing Chrome Manifest V3 extension
  outlook-template-vault/  Current extension source and its preserved history
App/
  mail-template-vault/     Private web application and MySQL API
supabase/
  migrations/              Retained legacy Supabase implementation
  functions/               Retained legacy Edge Function
docs/                      Architecture, security, and operational documentation
```

## Development rules

- Preserve the existing extension identity, manifest key, storage keys, and user data compatibility.
- Do not commit `.env`, `.env.local`, private keys, generated build output, or dependency directories.
- Never commit MySQL passwords, temporary admin passwords, Supabase service-role keys, or OpenAI API keys.
- The active schema is `App/mail-template-vault/database/schema.sql`; the `supabase/` folder is retained for history and is not used in the private deployment.
- Keep database credentials and OpenAI keys in Hostinger server environment variables only.

Each product area should document its own setup commands and required public configuration without including secret values.

