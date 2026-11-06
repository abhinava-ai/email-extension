import nodemailer from "nodemailer";

type AccountEmail = { to: string; name: string; purpose: "invite" | "reset"; link: string; invitedBy?: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

function transport() {
  const user = process.env.SMTP_USER?.trim();
  const host = process.env.SMTP_HOST?.trim() || (user ? "smtp.hostinger.com" : "");
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Port 587 starts unencrypted, so refuse to carry on unless it upgrades.
    requireTLS: port === 587,
    auth: user ? { user, pass: process.env.SMTP_PASSWORD || "" } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function content({ name, purpose, link, invitedBy }: AccountEmail) {
  const invite = purpose === "invite";
  const subject = invite ? "You're invited to Mail Template Vault" : "Reset your Mail Template Vault password";
  const lead = invite
    ? `${invitedBy ? `${invitedBy} has invited you` : "You have been invited"} to the shared email template workspace. Choose a password to get started.`
    : "We received a request to reset your password. If it wasn't you, ignore this email and your password stays the same.";
  const action = invite ? "Accept invitation" : "Choose a new password";
  const expiry = invite ? "This link works once and expires in 7 days." : "This link works once and expires in 1 hour.";
  const text = `Hi ${name},\n\n${lead}\n\n${action}: ${link}\n\n${expiry}\n`;
  const html = `<div style="background:#f7f8fa;padding:32px 16px;font-family:Aptos,'Segoe UI',Arial,sans-serif;color:#17181c"><div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e9ebef;border-radius:16px;padding:28px"><p style="margin:0 0 16px;font-size:16px;font-weight:600">Mail Template Vault</p><p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(name)},</p><p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#4b5361">${escapeHtml(lead)}</p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#17181c;color:#ffffff;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none">${action}</a><p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#737b88">${expiry}</p></div></div>`;
  return { subject, text, html };
}

function graphSettings() {
  const tenant = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const secret = process.env.GRAPH_CLIENT_SECRET?.trim();
  const from = process.env.MAIL_FROM?.trim();
  return tenant && clientId && secret && from ? { tenant, clientId, secret, from } : null;
}

// Microsoft 365 is turning off password-based SMTP, so its mailboxes send through Microsoft Graph.
async function sendWithGraph(email: AccountEmail, settings: NonNullable<ReturnType<typeof graphSettings>>) {
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: settings.clientId, client_secret: settings.secret, scope: "https://graph.microsoft.com/.default" }),
    signal: AbortSignal.timeout(10000),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) throw new Error(`Microsoft sign-in failed (${tokenResponse.status} ${token.error || "no token"})`);
  const { subject, html } = content(email);
  const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(settings.from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: email.to, name: email.name } }] }, saveToSentItems: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!sendResponse.ok) {
    const failure = await sendResponse.json().catch(() => ({}));
    throw new Error(`Microsoft Graph refused the email (${sendResponse.status} ${failure.error?.code || "unknown"})`);
  }
}

// Never throws: a mail problem must not undo the member being added. The admin gets a link to share instead.
export async function sendAccountEmail(email: AccountEmail) {
  const graph = graphSettings();
  if (graph) {
    try {
      await sendWithGraph(email, graph);
      return true;
    } catch (error) {
      console.error("Could not send account email:", error instanceof Error ? error.message : "unknown error");
      return false;
    }
  }
  const mailer = transport();
  if (!mailer) return false;
  const address = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "no-reply@localhost";
  try {
    await mailer.sendMail({ from: { name: "Mail Template Vault", address }, to: email.to, ...content(email) });
    return true;
  } catch (error) {
    console.error("Could not send account email:", error instanceof Error ? error.message : "unknown error");
    return false;
  } finally {
    mailer.close();
  }
}
