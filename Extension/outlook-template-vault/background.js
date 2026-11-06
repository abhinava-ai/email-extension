importScripts('supabase-config.js', 'storage.js');

const OUTLOOK_ORIGINS = new Set([
  'https://outlook.office.com',
  'https://outlook.office365.com',
  'https://outlook.live.com',
  'https://outlook.cloud.microsoft'
]);
const AUTH_STORAGE_KEY = 'mtv_api_auth_v1';
const MIGRATION_KEY = 'mtv_mysql_migrated_v1';
// v1 could hold a left-side position from the old default. Popovers now start on the right.
const LEGACY_FLOAT_STATE_KEY = 'mtv_floating_window_v1';
const FLOAT_STATE_KEY = 'mtv_floating_window_v2';
const PREFERENCES_KEY = 'mtv_preferences_v1';
const INTERFACE_MODES = new Set(['sidepanel', 'popover', 'inline']);
const SORT_ORDERS = new Set(['name', 'recent']);
const DEFAULT_PREFERENCES = Object.freeze({
  interfaceMode: 'popover',
  inlineButton: true,
  closeAfterInsert: false,
  sortOrder: 'name'
});
const PRIVATE_ACCESS = Object.freeze({
  version: 1,
  plan: 'Private',
  templateLimit: null,
  chromeSync: false,
  richEditor: true,
  validatedAt: null
});

function apiConfig() {
  const value = globalThis.MAIL_TEMPLATE_VAULT_CONFIG || {};
  const baseUrl = String(value.apiBaseUrl || '').trim().replace(/\/$/, '');
  return {
    baseUrl,
    configured: /^https:\/\//i.test(baseUrl) || /^http:\/\/localhost(?::\d+)?$/i.test(baseUrl)
  };
}

async function authToken() {
  return (await chrome.storage.local.get(AUTH_STORAGE_KEY))[AUTH_STORAGE_KEY]?.token || null;
}

async function api(path, options = {}) {
  const config = apiConfig();
  const token = await authToken();
  if (!config.configured) throw new Error('The private API is not configured.');
  if (!token) throw new Error('Sign in to access shared templates.');
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(body?.error || 'The private API is unavailable.');
  return body;
}

async function fetchRemoteTemplates() {
  const body = await api('/api/templates');
  return Array.isArray(body.templates) ? body.templates : [];
}

async function clearLegacyTemplateData() {
  await chrome.storage.local.remove([TemplateStorage.LOCAL_KEY, MIGRATION_KEY, LEGACY_FLOAT_STATE_KEY]);
  const synced = await chrome.storage.sync.get(null);
  const keys = Object.keys(synced).filter((key) =>
    key === TemplateStorage.MANIFEST_KEY || key.startsWith('etm_chunk_v1_'));
  if (keys.length) await chrome.storage.sync.remove(keys);
}

async function remoteStorage(operation, payload = {}) {
  if (operation === 'load' || operation === 'reconcile') {
    const templates = await fetchRemoteTemplates();
    return { templates, remote: true, synced: true, entitlements: PRIVATE_ACCESS };
  }
  if (operation === 'upsert') {
    const creating = !payload.template.serverVersion;
    const path = creating ? '/api/templates' : `/api/templates/${encodeURIComponent(payload.template.id)}`;
    const body = await api(path, {
      method: creating ? 'POST' : 'PUT',
      body: JSON.stringify({ ...payload.template, expectedVersion: payload.template.serverVersion })
    });
    return { template: body.template, templates: await fetchRemoteTemplates(), synced: true, remote: true, entitlements: PRIVATE_ACCESS };
  }
  if (operation === 'remove') {
    const existing = (await fetchRemoteTemplates()).find((item) => item.id === payload.id);
    if (!existing?.serverVersion) throw new Error('Reload templates before deleting this item.');
    await api(`/api/templates/${encodeURIComponent(payload.id)}?version=${existing.serverVersion}`, { method: 'DELETE' });
    return { templates: await fetchRemoteTemplates(), synced: true, remote: true, entitlements: PRIVATE_ACCESS };
  }
  if (operation === 'replace') {
    await api('/api/templates/import', { method: 'POST', body: JSON.stringify({ templates: payload.templates }) });
    return remoteStorage('load');
  }
  throw new Error('Unknown storage operation.');
}

function trustedOutlook(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab?.url) return false;
  try { return OUTLOOK_ORIGINS.has(new URL(sender.tab.url).origin); }
  catch (_) { return false; }
}

function trustedExtensionPage(sender) {
  return sender.id === chrome.runtime.id && Boolean(sender.url?.startsWith(chrome.runtime.getURL('')));
}

function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    interfaceMode: INTERFACE_MODES.has(input.interfaceMode) ? input.interfaceMode : DEFAULT_PREFERENCES.interfaceMode,
    inlineButton: typeof input.inlineButton === 'boolean' ? input.inlineButton : DEFAULT_PREFERENCES.inlineButton,
    closeAfterInsert: typeof input.closeAfterInsert === 'boolean' ? input.closeAfterInsert : DEFAULT_PREFERENCES.closeAfterInsert,
    sortOrder: SORT_ORDERS.has(input.sortOrder) ? input.sortOrder : DEFAULT_PREFERENCES.sortOrder
  };
}

async function getPreferences() {
  return normalizePreferences((await chrome.storage.local.get(PREFERENCES_KEY))[PREFERENCES_KEY]);
}

async function applyInterfaceMode(mode) {
  // In side panel mode Chrome opens the panel itself and action.onClicked does not fire.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: mode === 'sidepanel' });
}

async function closeNativeSidePanel() {
  await chrome.sidePanel.setOptions({ enabled: false });
  await chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel.html' });
}

async function broadcastPreferences(preferences) {
  const message = { type: 'ETM_PREFERENCES_CHANGED', preferences };
  const tabs = await chrome.tabs.query({ url: [...OUTLOOK_ORIGINS].map((origin) => `${origin}/*`) });
  await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, message)));
  // Rejects when no other extension page is open, which is fine.
  await chrome.runtime.sendMessage(message).catch(() => {});
}

async function setPreferences(patch) {
  const previous = await getPreferences();
  const next = normalizePreferences({ ...previous, ...patch });
  await chrome.storage.local.set({ [PREFERENCES_KEY]: next });
  if (next.interfaceMode !== previous.interfaceMode) {
    await applyInterfaceMode(next.interfaceMode);
    if (previous.interfaceMode === 'sidepanel') await closeNativeSidePanel();
  }
  await broadcastPreferences(next);
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ETM_PREFERENCES_GET' && (trustedOutlook(sender) || trustedExtensionPage(sender))) {
    getPreferences().then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.type === 'ETM_PREFERENCES_SET') {
    if (!trustedExtensionPage(sender)) {
      sendResponse({ ok: false, error: 'Settings access denied.' });
      return;
    }
    setPreferences(message.preferences).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.type === 'ETM_FLOAT_STATE_RESET' && trustedExtensionPage(sender)) {
    chrome.storage.local.remove(FLOAT_STATE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'ETM_FLOAT_STATE_GET' && trustedOutlook(sender)) {
    chrome.storage.local.get(FLOAT_STATE_KEY).then((value) => sendResponse({ ok: true, result: value[FLOAT_STATE_KEY] || null }));
    return true;
  }
  if (message?.type === 'ETM_FLOAT_STATE_SET' && trustedOutlook(sender)) {
    const state = message.state || {};
    const clean = {
      left: Number(state.left) || 8,
      top: Number(state.top) || 60,
      width: Number(state.width) || 400,
      height: Number(state.height) || 680,
      minimized: Boolean(state.minimized)
    };
    chrome.storage.local.set({ [FLOAT_STATE_KEY]: clean }).then(() => sendResponse({ ok: true, result: clean }));
    return true;
  }
  if (message?.type === 'ETM_ENTITLEMENTS') {
    sendResponse({ ok: true, result: PRIVATE_ACCESS });
    return;
  }
  if (message?.type === 'ETM_CLEAR_TEMPLATE_DATA' && sender.id === chrome.runtime.id) {
    clearLegacyTemplateData().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.type === 'ETM_CONTEXT_TEMPLATES') {
    if (!trustedOutlook(sender)) {
      sendResponse({ ok: false, error: 'Contextual template access denied.' });
      return;
    }
    remoteStorage('load').then(
      (result) => sendResponse({ ok: true, result: { templates: result.templates } }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.type !== TemplateStorage.CHANNEL) return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) ||
      !['load', 'upsert', 'remove', 'replace', 'reconcile'].includes(message.operation)) {
    sendResponse({ ok: false, error: 'Storage access denied.' });
    return;
  }
  remoteStorage(message.operation, message.payload).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error.message })
  );
  return true;
});

function isOutlookUrl(url) {
  try { return OUTLOOK_ORIGINS.has(new URL(url).origin); }
  catch (_) { return false; }
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Without a host permission Chrome hides tab.url, so an unknown URL is not Outlook.
    // Settings explains how the extension works instead of the click doing nothing.
    if (!tab.id || !isOutlookUrl(tab.url)) {
      await chrome.runtime.openOptionsPage();
      return;
    }
    const { interfaceMode } = await getPreferences();
    const message = { type: interfaceMode === 'inline' ? 'ETM_TOGGLE_INLINE' : 'ETM_TOGGLE_VAULT' };
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['sanitizer.js', 'content.js', 'floating.js']
      });
      await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (error) { console.warn('Could not open the template vault:', error); }
});

async function configureExtension() {
  try { await applyInterfaceMode((await getPreferences()).interfaceMode); } catch (_) {}
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (error) { console.warn('Could not restrict storage:', error); }
  try { await clearLegacyTemplateData(); }
  catch (error) { console.warn('Could not clear legacy template cache:', error); }
}

chrome.runtime.onInstalled.addListener(configureExtension);
chrome.runtime.onStartup.addListener(configureExtension);
configureExtension();
