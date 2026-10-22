# Mail Template Vault for Outlook — v1.2.0

Private Chrome Manifest V3 extension for searching, editing, and inserting shared HTML email templates into Outlook Web.

## Private API

Set `apiBaseUrl` and `accountPortalUrl` in `supabase-config.js` before packaging. Despite its legacy filename, this file now contains public endpoints only; it contains no Supabase or MySQL credentials. Run `npm run build:auth` after authentication source changes.

Authentication uses an opaque API session token in trusted `chrome.storage.local`. Registration is disabled. The two initial users are provisioned by the server and must change their temporary password in the web portal before template access is allowed.

MySQL is authoritative. The extension stores a local offline cache and imports existing local templates once after the first authenticated connection. Version checks prevent one administrator from silently overwriting another administrator’s changes. Chrome Sync is no longer used for template synchronization.

## Outlook interface

Clicking the toolbar icon toggles a draggable, resizable window inside Outlook. It can be minimized or closed and remembers its geometry. The template editor opens inside that window and uses the packaged Jodit 4.15.1 editor. The original Chrome side-panel files remain packaged as the window’s internal UI and for rollback compatibility, but the toolbar no longer opens Chrome’s fixed side panel.

The smaller contextual template picker remains next to an active compose editor and inserts selected templates at the cursor. It does not inspect conversation threads and never clicks Send.

## Install/update

1. Open `chrome://extensions` and enable Developer mode.
2. Choose Load unpacked and select this folder, or click Reload for an existing installation.
3. Reload open Outlook tabs so the new content scripts are injected.
4. Click the extension toolbar icon while an Outlook Web tab is active.

The manifest key remains unchanged, preserving the extension identity and local cache.

## Verification

```sh
npm ci
npm run vendor
npm run build:auth
npm test
```

Export remains available as a user-controlled backup. Active scripts, event handlers, unsafe links, and unsupported layout features are removed before storing or inserting HTML.
