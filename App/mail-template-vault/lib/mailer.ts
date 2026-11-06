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

// Never throws: a mail problem must not undo the member being added. The admin gets a link to share instead.
export async function sendAccountEmail(email: AccountEmail) {
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
