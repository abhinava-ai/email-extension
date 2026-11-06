"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, LoaderCircle, MailCheck, Send, ShieldCheck, ShieldOff, UserMinus, UserPlus, UserRoundCheck } from "lucide-react";
import { useConfirm } from "./confirm-dialog";

export type TeamMember = { id: string; email: string; displayName: string; role: "admin" | "member"; active: boolean; pendingPassword: boolean; lastSeen: string | null };
type Issued = { name: string; email: string; purpose: "invite" | "reset"; emailSent: boolean; link?: string };

export function TeamManager({ members, currentUserId }: { members: TeamMember[]; currentUserId: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [copied, setCopied] = useState(false);
  const addDialog = useRef<HTMLDialogElement>(null);
  const issuedDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { if (adding && !addDialog.current?.open) addDialog.current?.showModal(); }, [adding]);
  useEffect(() => { if (issued && !issuedDialog.current?.open) issuedDialog.current?.showModal(); }, [issued]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setAddError("");
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get("displayName") || "").trim();
    const email = String(data.get("email") || "").trim();
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, email, role: data.get("role") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not add this member.");
      setAdding(false);
      setCopied(false);
      setIssued({ name: displayName, email, purpose: "invite", emailSent: body.emailSent, link: body.link });
      router.refresh();
    } catch (failure) {
      setAddError(failure instanceof TypeError ? "Could not reach the server. Try again." : failure instanceof Error ? failure.message : "Could not add this member.");
    } finally {
      setBusy("");
    }
  }

  async function update(member: TeamMember, change: Record<string, unknown>) {
    setBusy(member.id);
    setError("");
    try {
      const response = await fetch(`/api/team/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update this member.");
      if (change.action === "send_link") {
        setCopied(false);
        setIssued({ name: member.displayName, email: member.email, purpose: body.purpose, emailSent: body.emailSent, link: body.link });
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? "Could not reach the server. Try again." : failure instanceof Error ? failure.message : "Could not update this member.");
    } finally {
      setBusy("");
    }
  }

  async function sendLink(member: TeamMember) {
    if (await confirm(member.pendingPassword
      ? { title: `Resend ${member.displayName}'s invitation?`, message: "A new link goes out and the previous one stops working.", confirmLabel: "Resend invitation" }
      : { title: `Send ${member.displayName} a password reset?`, message: "They get a link that expires in 1 hour. Their current password keeps working until they use it.", confirmLabel: "Send reset link" })) update(member, { action: "send_link" });
  }
  async function toggleRole(member: TeamMember) {
    const makeAdmin = member.role !== "admin";
    if (await confirm(makeAdmin
      ? { title: `Make ${member.displayName} an administrator?`, message: "They will be able to add and manage members and see all device history.", confirmLabel: "Make administrator" }
      : { title: `Remove ${member.displayName}'s administrator access?`, message: "They will keep using templates, but can no longer manage members.", confirmLabel: "Make member", danger: true })) update(member, { action: "set_role", role: makeAdmin ? "admin" : "member" });
  }
  async function toggleActive(member: TeamMember) {
    if (!member.active) { update(member, { action: "set_active", active: true }); return; }
    if (await confirm({ title: `Deactivate ${member.displayName}?`, message: "They are signed out everywhere and can no longer sign in. Their templates stay in the library, and you can reactivate them later.", confirmLabel: "Deactivate", danger: true })) update(member, { action: "set_active", active: false });
  }

  function closeIssued() {
    issuedDialog.current?.close();
    setIssued(null);
  }

  async function copyDetails() {
    if (issued?.link) await navigator.clipboard.writeText(issued.link);
    setCopied(true);
  }

  const activeCount = members.filter((member) => member.active).length;
  return (
    <>
      {dialog}
      <div className="library-head team-head">
        <div>
          <h1>Team</h1>
          <p>{activeCount} active {activeCount === 1 ? "member" : "members"}. Everyone shares the same template library.</p>
        </div>
        <button className="button button-primary" onClick={() => { setAddError(""); setAdding(true); }}><UserPlus size={17} />Invite member</button>
      </div>

      {error && <div className="form-message team-message" role="alert">{error}</div>}

      <div className="team-list">
        {members.map((member) => {
          const self = member.id === currentUserId;
          return (
            <article className={`team-row${member.active ? "" : " is-inactive"}`} key={member.id}>
              <span className="avatar">{(member.displayName || member.email).slice(0, 1).toUpperCase()}</span>
              <div className="team-identity">
                <strong>{member.displayName}{self && <span className="team-you">You</span>}</strong>
                <span>{member.email}</span>
                <small>{member.lastSeen ? `Last active ${new Date(member.lastSeen).toLocaleString()}` : "Has not signed in yet"}</small>
              </div>
              <div className="team-badges">
                <span className={`team-chip${member.role === "admin" ? " admin" : ""}`}>{member.role === "admin" ? "Administrator" : "Member"}</span>
                {!member.active && <span className="session-status removed">Deactivated</span>}
                {member.active && member.pendingPassword && <span className="session-status inactive">Invited</span>}
              </div>
              {!self && (
                <div className="team-actions">
                  {busy === member.id ? <LoaderCircle size={18} className="spin" /> : (
                    <>
                      {member.active && (member.pendingPassword
                        ? <button className="icon-button small" title="Resend invitation" aria-label={`Resend invitation to ${member.displayName}`} onClick={() => sendLink(member)}><Send size={15} /></button>
                        : <button className="icon-button small" title="Send password reset" aria-label={`Send password reset to ${member.displayName}`} onClick={() => sendLink(member)}><KeyRound size={15} /></button>)}
                      {member.active && <button className="icon-button small" title={member.role === "admin" ? "Remove administrator access" : "Make administrator"} aria-label={`${member.role === "admin" ? "Remove administrator access from" : "Make administrator:"} ${member.displayName}`} onClick={() => toggleRole(member)}>{member.role === "admin" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}</button>}
                      {member.active
                        ? <button className="icon-button small danger" title="Deactivate" aria-label={`Deactivate ${member.displayName}`} onClick={() => toggleActive(member)}><UserMinus size={15} /></button>
                        : <button className="link-button" onClick={() => toggleActive(member)}><UserRoundCheck size={14} />Reactivate</button>}
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {adding && (
        <dialog ref={addDialog} className="confirm-dialog" aria-labelledby="add-member-title" onCancel={(event) => { event.preventDefault(); setAdding(false); }}>
          <form className="confirm-body" onSubmit={addMember}>
            <h2 id="add-member-title">Invite a team member</h2>
            <p>They get an email with a link to choose their own password. The link expires in 7 days.</p>
            <div className="form-stack">
              <div className="field"><label htmlFor="member-name">Full name</label><input id="member-name" name="displayName" maxLength={120} required autoFocus /></div>
              <div className="field"><label htmlFor="member-email">Email address</label><input id="member-email" name="email" type="email" maxLength={254} autoComplete="off" required /></div>
              <div className="field"><label htmlFor="member-role">Role</label>
                <select id="member-role" name="role" defaultValue="member" className="field-select">
                  <option value="member">Member: uses and edits templates</option>
                  <option value="admin">Administrator: also manages the team</option>
                </select>
              </div>
              {addError && <div className="form-message" role="alert">{addError}</div>}
            </div>
            <div className="confirm-actions team-dialog-actions">
              <button type="button" className="button button-secondary" onClick={() => setAdding(false)}>Cancel</button>
              <button className="button button-primary" disabled={busy === "add"}>{busy === "add" ? <LoaderCircle size={17} className="spin" /> : <Send size={16} />}Send invitation</button>
            </div>
          </form>
        </dialog>
      )}

      {issued && (
        <dialog ref={issuedDialog} className="confirm-dialog" aria-labelledby="issued-title" onCancel={(event) => event.preventDefault()}>
          <div className="confirm-body">
            <h2 id="issued-title">{issued.purpose === "invite" ? "Invitation" : "Password reset"} {issued.emailSent ? "sent" : "ready to share"}</h2>
            {issued.emailSent ? (
              <p className="issued-sent" data-testid="email-sent"><MailCheck size={17} /><span>Email sent to {issued.email}. The link expires in {issued.purpose === "invite" ? "7 days" : "1 hour"}.</span></p>
            ) : (
              <>
                <p>Send this link to {issued.name} privately. <strong>It is shown only once</strong> and expires in {issued.purpose === "invite" ? "7 days" : "1 hour"}.</p>
                <p className="issued-warning">The email could not be sent, so share the link yourself. If you expected an email, check the email settings on the server.</p>
                <div className="issued-details"><span>{issued.email}</span><code data-testid="account-link">{issued.link}</code></div>
              </>
            )}
            <div className="confirm-actions team-dialog-actions">
              {issued.link && <button type="button" className="button button-secondary" onClick={copyDetails}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button>}
              <button type="button" className="button button-primary" onClick={closeIssued}>Done</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
