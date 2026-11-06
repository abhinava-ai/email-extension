import { existsSync } from "node:fs";
import path from "node:path";
import { CheckCircle2, Chrome, Download, PanelLeft, PanelsTopLeft, Pin, TextCursorInput } from "lucide-react";

export const metadata = { title: "Install extension" };

export default function InstallPage() {
  const packageAvailable = existsSync(path.join(process.cwd(), "private", "mail-template-vault-extension.zip"));
  return (
    <div className="page">
      <div className="page-heading"><div><h1>Install the extension</h1><p>Add Mail Template Vault to Chrome, then keep it one click away while you work in Outlook.</p></div></div>
      <div className="grid grid-2">
        <section className="card">
          <h2>Private installation</h2>
          <p>Download the approved package, unzip it, then choose Load unpacked on Chrome&apos;s extension page. Public Web Store registration is not required for private use.</p>
          {packageAvailable
            ? <a className="button button-primary" href="/api/extension/download" download><Download size={18} />Download extension package</a>
            : <p className="form-message">The extension package has not been uploaded to this site yet. Ask an administrator for the approved package.</p>}
          <div className="divider" />
          <div className="callout"><CheckCircle2 size={21} /><div><strong>Existing extension users</strong><p>Reload the existing installation so its identity and local template migration data are preserved.</p></div></div>
        </section>
        <section className="card">
          <h2>After installation</h2>
          <div className="list" style={{ marginTop: 12 }}>
            <div className="list-row"><span className="step-number">1</span><div className="list-copy"><strong>Pin the extension</strong><span>Select the puzzle icon in Chrome and pin Mail Template Vault.</span></div><Pin size={18} /></div>
            <div className="list-row"><span className="step-number">2</span><div className="list-copy"><strong>Open Outlook Web</strong><span>Reload existing Outlook tabs after updating the extension.</span></div><Chrome size={18} /></div>
            <div className="list-row"><span className="step-number">3</span><div className="list-copy"><strong>Select the extension icon</strong><span>Your chosen interface opens. The popover is used until you change it.</span></div><PanelsTopLeft size={18} /></div>
          </div>
        </section>
      </div>
      <section className="section-title"><h2>Choose how it opens</h2></section>
      <div className="grid grid-3">
        <div className="card"><span className="stat-icon"><PanelLeft size={17} /></span><h3 className="mode-title">Side Panel</h3><p className="mode-text">Chrome&apos;s built-in panel stays open beside Outlook.</p></div>
        <div className="card"><span className="stat-icon"><PanelsTopLeft size={17} /></span><h3 className="mode-title">Popover</h3><p className="mode-text">A floating window you can move, resize and minimize.</p></div>
        <div className="card"><span className="stat-icon"><TextCursorInput size={17} /></span><h3 className="mode-title">Inline Editor</h3><p className="mode-text">A small picker right inside the email you are writing.</p></div>
      </div>
      <p className="mode-hint">Switch any time: open the extension&apos;s menu and choose Settings &amp; interface.</p>
    </div>
  );
}
