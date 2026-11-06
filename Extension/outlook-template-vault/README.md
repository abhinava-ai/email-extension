# Mail Template Vault for Outlook — v1.3.0

Private Chrome Manifest V3 extension for searching, editing, and inserting shared HTML email templates into Outlook Web.

## Private API

Set `apiBaseUrl` and `accountPortalUrl` in `supabase-config.js` before packaging. Despite its legacy filename, this file now contains public endpoints only; it contains no Supabase or MySQL credentials. Run `npm run build:auth` after authentication source changes.

Authentication uses an opaque API session token in trusted `chrome.storage.local`. Registration is disabled. The two initial users are provisioned by the server and must change their temporary password in the web portal before template access is allowed.

MySQL is authoritative. The extension stores a local offline cache and imports existing local templates once after the first authenticated connection. Version checks prevent one administrator from silently overwriting another administrator’s changes. Chrome Sync is no longer used for template synchronization.

## Outlook interface

Users choose one of three interfaces under Settings (`settings.html`, opened from the panel menu or the extension's Options). The choice decides what the toolbar icon does:

- **Side Panel:** Chrome's native side panel, which opens on the right. The side is a Chrome setting (`chrome://settings/appearance`), not something an extension can force.
- **Popover (default):** a draggable, resizable window inside Outlook that can be minimized to a bubble or closed, and remembers its position and size.
- **Inline Editor:** a picker opened from a button in the corner of the active compose body. It supports search, arrow keys, Enter and Escape.

The compose button can also be shown in the other two modes, and is on by default. All interfaces insert at the cursor. They do not inspect conversation threads and never click Send.

The extension is read-only: templates are added and edited in the web dashboard, and appear here after a sync.

Templates are inserted through Outlook's own paste handler. Outlook strips inline styles from `execCommand('insertHTML')` and leaves it out of its undo history, while the paste route keeps the styles and gives a normal Ctrl+Z and Ctrl+Y step. `sanitizer.js` is the single formatting engine: the web app uses a generated copy (`App/mail-template-vault/lib/template-sanitizer.js`). After changing it, run `node scripts/sync-sanitizer.cjs` from the repository root.

## Install/update

1. Open `chrome://extensions` and enable Developer mode.
2. Choose Load unpacked and select this folder, or click Reload for an existing installation.
3. Reload open Outlook tabs so the new content scripts are injected.
4. Click the extension toolbar icon while an Outlook Web tab is active.

The manifest key remains unchanged, preserving the extension identity and local cache.

## Live development

Run `npm run dev` here and load `Extension/chrome-dev` with Load unpacked. Saved edits sync to that folder and the extension reloads itself within a few seconds. Reload open Outlook tabs to pick up `content.js` and `floating.js` changes.

`npm run dev` uses the Hostinger API, so it works with real data. Use `npm run dev:local` for `http://localhost:3000`. Edit this source folder only, because `chrome-dev` is generated and overwritten.

## Verification

```sh
npm ci
npm run vendor
npm run build:auth
npm test
```

Export remains available as a user-controlled backup. Active scripts, event handlers, unsafe links, and unsupported layout features are removed before storing or inserting HTML.
