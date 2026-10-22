# Private Hostinger deployment

Use a Hostinger Business/Unlimited or Cloud plan with Node.js Web Apps and MySQL. Select Node 22 or 24, set the application root to `App/mail-template-vault`, build with `npm ci && npm run build`, and start with `npm start`.

Configure the values documented in `.env.example`. Use `DB_HOST=127.0.0.1`; never commit real values.

## First deployment

1. Create the MySQL database and user in hPanel.
2. Run `npm run db:migrate`.
3. Temporarily set one 12+ character `ADMIN_TEMP_PASSWORD` value for both initial administrators.
4. Run `npm run db:bootstrap` once, then remove the temporary variable.
5. Sign in as each administrator and change the temporary password.
6. Set the extension’s public API and portal URLs to the HTTPS production origin.
7. Reload/package the extension and complete the smoke test.

Package the production extension from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-extension.ps1 `
  -ApiBaseUrl "https://templates.abhinava.ai"
```

Replace the example with the deployed app URL. The URL is mandatory; packaging removes
the localhost endpoint and narrows network permission to that exact HTTPS host.

Test login throttling, mandatory password changes, editing in both directions, version conflicts, one-time local import, offline cache behavior, AI replies, and floating-window drag/resize/minimize behavior.
