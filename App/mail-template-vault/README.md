# Mail Template Vault private portal

Hostinger-compatible Next.js application and authenticated API backed by MySQL. Public registration and email verification are intentionally disabled.

## Local setup

1. Copy `.env.example` to `.env.local` and enter a local MySQL database.
2. Run `npm install`, `npm run db:migrate`, and then `npm run db:bootstrap` with the temporary `ADMIN_TEMP_PASSWORD` environment variable.
3. Remove those temporary values and run `npm run dev`.

Both initial users are administrators and must replace their temporary password after first login. The bootstrap command never overwrites an existing password.

For production, set secrets in Hostinger hPanel, use `DB_HOST=127.0.0.1`, build with `npm run build`, and start with `npm start`. Never expose database or OpenAI credentials through `NEXT_PUBLIC_*` variables or extension files.
