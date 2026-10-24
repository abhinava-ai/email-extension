importScripts('supabase-config.js', 'storage.js');

const OUTLOOK_ORIGINS = new Set([
  'https://outlook.office.com',
  'https://outlook.office365.com',
  'https://outlook.live.com',
  'https://outlook.cloud.microsoft'
]);
const AUTH_STORAGE_KEY = 'mtv_api_auth_v1';
const MIGRATION_KEY = 'mtv_mysql_migrated_v1';
const FLOAT_STATE_KEY = 'mtv_floating_window_v1';
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
  await chrome.storage.local.remove([TemplateStorage.LOCAL_KEY, MIGRATION_KEY]);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  try {
    if (!OUTLOOK_ORIGINS.has(new URL(tab.url).origin)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ETM_TOGGLE_VAULT' });
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['sanitizer.js', 'content.js', 'floating.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'ETM_TOGGLE_VAULT' });
    }
  } catch (error) { console.warn('Could not toggle template vault:', error); }
});

async function configureExtension() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch (_) {}
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
