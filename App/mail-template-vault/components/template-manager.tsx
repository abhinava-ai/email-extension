"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Mail, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import type { EmailEditor } from "@/lib/email-editor";
import { useConfirm } from "./confirm-dialog";

type Template = { id: string; name: string; html: string; serverVersion: number; createdAt: number; updatedAt: number; updatedBy: string };
type Notice = { kind: "success" | "error"; text: string } | null;

const WEEK = 7 * 86400000;

function plainText(html: string) {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function personName(email: string) {
  const local = (email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Shared library";
}

function formatUpdated(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function TemplateManager() {
  const router = useRouter();
  const [list, setList] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<EmailEditor | null>(null);
  const startingHtml = useRef("");
  const saveRef = useRef<() => void>(() => {});
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.status === 403) { router.push("/change-password"); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load templates.");
      setList(body.templates);
      setNowMs(Date.now());
    } catch (error) {
      setLoadFailed(true);
      setNotice({ kind: "error", text: error instanceof Error && !(error instanceof TypeError) ? error.message : "Could not reach the server. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load happens when the page opens.
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected || !area.current) return;
      const { createEmailEditor } = await import("@/lib/email-editor");
      if (cancelled) return;
      const created = await createEmailEditor(area.current, () => saveRef.current());
      if (cancelled) { created.destroy(); return; }
      editor.current = created;
      created.setHtml(selected.html);
      startingHtml.current = created.getHtml();
    })();
    return () => {
      cancelled = true;
      editor.current?.destroy();
      editor.current = null;
    };
  }, [selected]);

  const hasUnsavedChanges = useCallback(() => {
    if (!selected) return false;
    return name !== selected.name || Boolean(editor.current && editor.current.getHtml() !== startingHtml.current);
  }, [name, selected]);

  // Picks up changes other people made while this tab was in the background.
  useEffect(() => {
    if (selected) return;
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, selected]);

  useEffect(() => {
    if (!selected) return;
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges()) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges, selected]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((item) => item.name.toLowerCase().includes(term) || plainText(item.html).toLowerCase().includes(term));
  }, [list, query]);

  function edit(item?: Template) {
    const draft = item || { id: crypto.randomUUID(), name: "", html: "<p></p>", serverVersion: 0, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: "" };
    setSelected(draft);
    setName(draft.name);
    setNotice(null);
  }

  async function cancelEdit() {
    if (hasUnsavedChanges() && !(await confirm({ title: "Discard your changes?", message: "Your unsaved changes to this template will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true }))) return;
    setSelected(null);
    setNotice(null);
  }

  async function save() {
    if (!selected || !editor.current || saving) return;
    if (!name.trim()) { setNotice({ kind: "error", text: "Enter a template name before saving." }); return; }
    setSaving(true);
    setNotice(null);
    const creating = selected.serverVersion === 0;
    try {
      const response = await fetch(creating ? "/api/templates" : `/api/templates/${selected.id}`, {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, name, html: editor.current.getHtml(), expectedVersion: selected.serverVersion }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save template.");
      setSelected(null);
      setNotice({ kind: "success", text: `Saved “${name.trim()}”. It appears in the extension automatically.` });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof TypeError ? "Could not reach the server. Your changes are still here, so try saving again." : error instanceof Error ? error.message : "Could not save template." });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { saveRef.current = save; });

  async function remove(item: Template) {
    if (deleting || !(await confirm({ title: "Delete this template?", message: `“${item.name}” will be removed for everyone in the workspace.`, confirmLabel: "Delete", danger: true }))) return;
    setDeleting(item.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/templates/${item.id}?version=${item.serverVersion}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not delete template.");
      setNotice({ kind: "success", text: `Deleted “${item.name}”.` });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof TypeError ? "Could not reach the server. Try again." : error instanceof Error ? error.message : "Could not delete template." });
    } finally {
      setDeleting("");
    }
  }

  const noticeBanner = notice && <div className={`form-message${notice.kind === "success" ? " success" : ""}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>;

  if (selected) {
    return (
      <section className="card template-editor-card">
        {dialog}
        <div className="template-editor-heading">
          <h2>{selected.serverVersion ? "Edit template" : "New template"}</h2>
          <p>{selected.serverVersion ? `Last changed by ${selected.updatedBy}` : "Shared with both administrators after saving."}</p>
        </div>
        <div className="field template-name-field">
          <label htmlFor="template-name">Template name</label>
          <input id="template-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </div>
        <div className="template-editor"><textarea ref={area} defaultValue={selected.html} /></div>
        {noticeBanner && <div className="template-editor-message">{noticeBanner}</div>}
        <div className="template-editor-actions">
          <button className="button button-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          <button className="button button-secondary" disabled={saving} onClick={cancelEdit}>Cancel</button>
        </div>
      </section>
    );
  }

  return (
    <section className="library">
      {dialog}
      <div className="library-head">
        <div>
          <h1>Templates</h1>
          <p>{loading && !list.length ? "Loading…" : query.trim() ? `${filtered.length} of ${list.length} templates` : `${list.length} ${list.length === 1 ? "template" : "templates"}`}</p>
        </div>
        <button className="button button-primary library-new" onClick={() => edit()}><FilePlus2 size={17} />New template</button>
      </div>

      <label className="search-field">
        <Search size={18} />
        <input type="search" placeholder="Search Template" aria-label="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>

      {noticeBanner}

      {loading && !list.length ? (
        <div className="template-grid" aria-hidden="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
      ) : loadFailed && !list.length ? (
        <div className="card empty-card"><span className="empty-icon"><RefreshCw size={22} /></span><h3>Templates could not load</h3><p>Check your connection and try again.</p><button className="button button-secondary" onClick={load}>Try again</button></div>
      ) : !list.length ? (
        <div className="card empty-card"><span className="empty-icon"><Mail size={22} /></span><h3>No templates yet</h3><p>Create the first shared template.</p><button className="button button-primary" onClick={() => edit()}><FilePlus2 size={17} />New template</button></div>
      ) : !filtered.length ? (
        <div className="card empty-card"><h3>No matches</h3><p>Try another search term.</p></div>
      ) : (
        <div className="template-grid">
          {filtered.map((item) => (
            <article className="template-tile" key={item.id}>
              <div className="tile-top">
                <span className="tile-icon"><Mail size={15} /></span>
                <strong title={item.name}>{item.name}</strong>
                {nowMs - item.updatedAt < WEEK && <span className="chip">Updated</span>}
              </div>
              <p className="tile-preview">{plainText(item.html) || "Empty template"}</p>
              <div className="tile-action">
                <span className="tile-person"><span className="avatar small">{personName(item.updatedBy).charAt(0)}</span><span>{personName(item.updatedBy)} · {formatUpdated(item.updatedAt)}</span></span>
                <div className="tile-buttons">
                  <button className="link-button" onClick={() => edit(item)}><Pencil size={14} />Edit</button>
                  <button className="icon-button small danger" title="Delete template" aria-label={`Delete ${item.name}`} disabled={deleting === item.id} onClick={() => remove(item)}><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <button className="fab" title="New template" aria-label="New template" onClick={() => edit()}><FilePlus2 size={22} /></button>
    </section>
  );
}
