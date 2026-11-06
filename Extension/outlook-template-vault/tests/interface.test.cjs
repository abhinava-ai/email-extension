const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium, expect } = require('@playwright/test');
const { createStorage } = require('./storage-fixture.cjs');

const root = path.resolve(__dirname, '..');
const OUTLOOK = 'https://outlook.office.com/mail';
const PAGE = 'chrome-extension://vault/settings.html';

function loadWorker(local = {}) {
  const fixture = createStorage({ local });
  const { context } = fixture;
  const calls = { behaviour: [], options: [], sent: [], injected: 0, optionsPage: 0 };
  let onMessage;
  let onClicked;
  context.URL = URL;
  context.MAIL_TEMPLATE_VAULT_CONFIG = { apiBaseUrl: 'https://templates.abhinava.ai' };
  context.importScripts = () => {};
  context.chrome.runtime = {
    id: 'vault',
    getURL: (name) => `chrome-extension://vault/${name}`,
    sendMessage: async () => ({}),
    openOptionsPage: async () => { calls.optionsPage += 1; },
    onMessage: { addListener: (fn) => { onMessage = fn; } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} }
  };
  context.chrome.action = { onClicked: { addListener: (fn) => { onClicked = fn; } } };
  context.chrome.tabs = {
    query: async () => [{ id: 7 }],
    sendMessage: async (tabId, message) => { calls.sent.push({ tabId, message }); return { ok: true }; }
  };
  context.chrome.scripting = { executeScript: async () => { calls.injected += 1; } };
  context.chrome.sidePanel = {
    setPanelBehavior: async (value) => { calls.behaviour.push(value.openPanelOnActionClick); },
    setOptions: async (value) => { calls.options.push(value.enabled); }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
  const send = (message, sender) => new Promise((resolve) => onMessage(message, sender, resolve));
  return { send, calls, click: (tab) => onClicked(tab), areas: fixture.areas, chrome: context.chrome };
}

const page = { id: 'vault', url: PAGE };
const plain = (value) => JSON.parse(JSON.stringify(value));

test('preferences default to the popover with the compose button on, and bad values fall back', async () => {
  const worker = loadWorker({ mtv_preferences_v1: { interfaceMode: 'nonsense', inlineButton: 'yes', sortOrder: 'x' } });
  const { result } = await worker.send({ type: 'ETM_PREFERENCES_GET' }, page);
  assert.deepEqual(plain(result), { interfaceMode: 'popover', inlineButton: true, closeAfterInsert: false, sortOrder: 'name' });
});

test('only extension pages can change preferences, though Outlook content scripts can read them', async () => {
  const worker = loadWorker();
  const content = { id: 'vault', url: OUTLOOK, tab: { url: OUTLOOK } };
  assert.equal((await worker.send({ type: 'ETM_PREFERENCES_GET' }, content)).ok, true);
  assert.equal((await worker.send({ type: 'ETM_PREFERENCES_SET', preferences: { interfaceMode: 'inline' } }, content)).ok, false);
  assert.equal((await worker.send({ type: 'ETM_PREFERENCES_GET' }, page)).result.interfaceMode, 'popover');
});

test('choosing Side Panel hands the toolbar click to Chrome, and leaving it closes the panel', async () => {
  const worker = loadWorker();
  await worker.send({ type: 'ETM_PREFERENCES_SET', preferences: { interfaceMode: 'sidepanel' } }, page);
  assert.equal(worker.calls.behaviour.at(-1), true);
  await worker.send({ type: 'ETM_PREFERENCES_SET', preferences: { interfaceMode: 'popover' } }, page);
  assert.equal(worker.calls.behaviour.at(-1), false);
  assert.deepEqual(worker.calls.options, [false, true]);
  assert.equal(worker.areas.local.mtv_preferences_v1.interfaceMode, 'popover');
});

test('changing a preference reaches open Outlook tabs', async () => {
  const worker = loadWorker();
  await worker.send({ type: 'ETM_PREFERENCES_SET', preferences: { inlineButton: false } }, page);
  const sent = worker.calls.sent.find((call) => call.message.type === 'ETM_PREFERENCES_CHANGED');
  assert.equal(sent.tabId, 7);
  assert.equal(sent.message.preferences.inlineButton, false);
});

test('the toolbar opens the chosen interface in Outlook and Settings everywhere else', async () => {
  const worker = loadWorker();
  await worker.click({ id: 1, url: OUTLOOK });
  assert.equal(worker.calls.sent.at(-1).message.type, 'ETM_TOGGLE_VAULT');
  await worker.send({ type: 'ETM_PREFERENCES_SET', preferences: { interfaceMode: 'inline' } }, page);
  await worker.click({ id: 1, url: OUTLOOK });
  assert.equal(worker.calls.sent.at(-1).message.type, 'ETM_TOGGLE_INLINE');
  await worker.click({ id: 2, url: 'https://example.com/' });
  await worker.click({ id: 3 });
  assert.equal(worker.calls.optionsPage, 2);
});

test('all three interfaces are declared in the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
  assert.equal(manifest.options_ui.page, 'settings.html');
  assert.ok(manifest.permissions.includes('sidePanel'));
  for (const script of ['content.js', 'floating.js']) assert.ok(manifest.content_scripts[0].js.includes(script));
  const settings = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
  for (const mode of ['sidepanel', 'popover', 'inline']) assert.match(settings, new RegExp(`value="${mode}"`));
});

let browser;
let server;
let base;
const now = Date.now();
const TEMPLATES = [
  { id: 'alpha', name: 'Alpha reply', html: '<p>Alpha body text</p>', updatedAt: now - 40 * 86400000, updatedBy: 'sandeep@abhinava.ai', serverVersion: 1 },
  { id: 'beta', name: 'Beta pitch', html: '<p>Beta body text</p>', updatedAt: now - 3600000, updatedBy: 'ankita@abhinava.ai', serverVersion: 1 }
];

before(async () => {
  server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    const filename = path.join(root, name);
    if (!/^[a-z-]+\.(?:html|js|css)$/.test(name) || !fs.existsSync(filename)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', `${name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript'}; charset=utf-8`);
    res.end(fs.readFileSync(filename));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function open(t, file, { signedIn = true, preferences = {}, templates = TEMPLATES, viewport = { width: 380, height: 720 } } = {}) {
  const context = await browser.newContext({ viewport });
  t.after(() => context.close());
  await context.addInitScript(({ signedIn, preferences, templates }) => {
    window.inserts = [];
    window.created = [];
    window.storedPreferences = { interfaceMode: 'popover', inlineButton: true, closeAfterInsert: false, sortOrder: 'name', ...preferences };
    window.fetch = async () => new Response(JSON.stringify(signedIn
      ? { user: { email: 'sandeep@abhinava.ai', displayName: 'Sandeep' } }
      : { error: 'Authentication required.' }), { status: signedIn ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
    window.chrome = {
      runtime: {
        id: 'test-extension',
        getURL: (name) => new URL(name, location.href).href,
        getManifest: () => ({ name: 'Vault', version: '1.3.0' }),
        openOptionsPage() { window.openedOptions = true; },
        sendMessage: async (message) => {
          if (message.type === 'ETM_STORAGE') {
            return signedIn ? { ok: true, result: { templates, remote: true } } : { ok: false, error: 'Sign in to access shared templates.' };
          }
          if (message.type === 'ETM_CONTEXT_TEMPLATES') return { ok: true, result: { templates } };
          if (message.type === 'ETM_PREFERENCES_GET') return { ok: true, result: window.storedPreferences };
          if (message.type === 'ETM_PREFERENCES_SET') {
            Object.assign(window.storedPreferences, message.preferences);
            return { ok: true, result: window.storedPreferences };
          }
          return { ok: true };
        },
        onMessage: { addListener: (fn) => { window.contentMessageListener = fn; } }
      },
      storage: {
        local: {
          get: async () => (signedIn ? { mtv_api_auth_v1: { token: 'token' } } : {}),
          set: async () => {},
          remove: async () => {}
        },
        onChanged: { addListener() {} }
      },
      tabs: {
        query: async () => [{ id: 1 }],
        create: ({ url }) => window.created.push(url),
        sendMessage: async (_, message) => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          window.inserts.push(message);
          return { ok: true };
        }
      }
    };
  }, { signedIn, preferences, templates });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/${file}`);
  return { page, errors };
}

test('signed out shows the sign-in card and no misleading empty state', async (t) => {
  const { page, errors } = await open(t, 'sidepanel.html', { signedIn: false, templates: [] });
  await expect(page.locator('#signedOutView')).toBeVisible();
  await expect(page.locator('#emptyState')).toBeHidden();
  await expect(page.locator('#searchInput')).toBeHidden();
  await expect(page.locator('#syncBtn')).toBeHidden();
  await expect(page.locator('#addTemplateFab')).toBeHidden();
  await page.locator('#showSignInBtn').click();
  await expect(page.locator('#authEmail')).toBeFocused();
  assert.deepEqual(errors, []);
});

test('the header counts templates and search updates the count', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  await expect(page.locator('.template-card')).toHaveCount(2);
  await expect(page.locator('#templateCount')).toHaveText('2 Templates');
  await page.locator('#searchInput').fill('beta');
  await expect(page.locator('.template-card')).toHaveCount(1);
  await expect(page.locator('#templateCount')).toHaveText('1 of 2 Templates');
  await page.locator('#searchInput').press('Escape');
  await expect(page.locator('.template-card')).toHaveCount(2);
});

test('a double click inserts one template, and the insert link works', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  const insert = page.locator('.template-card', { hasText: 'Alpha reply' }).locator('.template-insert');
  await insert.dblclick();
  await expect(page.locator('#toast')).toHaveText('Inserted: Alpha reply');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.inserts.filter((item) => item.type === 'ETM_INSERT_TEMPLATE').length), 1);
});

test('the three-dot menu opens without inserting, and preview and dashboard actions work', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  const card = page.locator('.template-card', { hasText: 'Beta pitch' });
  await card.locator('.card-more').click();
  await expect(page.locator('#cardMenu')).toBeVisible();
  assert.equal(await page.evaluate(() => window.inserts.length), 0);
  await page.locator('[data-card-action="preview"]').click();
  await expect(page.locator('#previewBody')).toContainText('Beta body text');
  await expect(page.locator('#previewTitle')).toHaveText('Beta pitch');
  await page.keyboard.press('Escape');
  await expect(page.locator('#previewSheet')).toBeHidden();
  await card.locator('.card-more').click();
  await page.locator('[data-card-action="manage"]').click();
  assert.match((await page.evaluate(() => window.created))[0], /\/templates$/);
  assert.equal(await page.evaluate(() => window.inserts.length), 0);
});

test('menus close on an outside click and Escape, and only one is open at a time', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  await expect(page.locator('.template-card')).toHaveCount(2);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#navMenu')).toBeVisible();
  await page.locator('#filterBtn').click();
  await expect(page.locator('#navMenu')).toBeHidden();
  await expect(page.locator('#filterMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#filterMenu')).toBeHidden();
  await page.locator('#menuBtn').click();
  await page.locator('#openSettingsBtn').click();
  assert.equal(await page.evaluate(() => window.openedOptions), true);
  await expect(page.locator('#navMenu')).toBeHidden();
});

test('filter sorts by recent, keeps the choice and can show only recent templates', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  await expect(page.locator('.template-name').first()).toHaveText('Alpha reply');
  await page.locator('#filterBtn').click();
  await page.locator('[data-sort="recent"]').click();
  await expect(page.locator('.template-name').first()).toHaveText('Beta pitch');
  await expect(page.locator('#sortLabel')).toHaveText('Recently updated');
  assert.equal(await page.evaluate(() => window.storedPreferences.sortOrder), 'recent');
  await page.locator('#filterBtn').click();
  await page.locator('#recentOnlyBtn').click();
  await expect(page.locator('.template-card')).toHaveCount(1);
  await expect(page.locator('#filterDot')).toBeVisible();
});

test('a failed load offers a retry instead of saying there are no templates', async (t) => {
  const failing = await open(t, 'sidepanel.html', { templates: [] });
  await expect(failing.page.locator('#emptyState')).toBeVisible();
  await failing.page.evaluate(() => {
    const original = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (message) => (message.type === 'ETM_STORAGE'
      ? { ok: false, error: 'Server unavailable' } : original(message));
    document.getElementById('syncBtn').click();
  });
  await expect(failing.page.locator('#errorState')).toBeVisible();
  await expect(failing.page.locator('#errorMessage')).toHaveText('Server unavailable');
  await expect(failing.page.locator('#emptyState')).toBeHidden();
});

async function compose(t, options) {
  const opened = await open(t, 'sidepanel.html', { viewport: { width: 1100, height: 760 }, ...options });
  const { page } = opened;
  await page.evaluate(() => {
    document.body.style.overflow = 'auto';
    document.body.innerHTML = '<input id="subject" aria-label="Subject"><div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:600px;height:300px">Hello</div>';
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.waitForTimeout(30);
  const shadow = (selector) => page.locator(`#mail-template-vault-assistant ${selector}`);
  return { ...opened, shadow };
}

test('the inline picker keeps typing smooth, inserts with Enter and restores focus on Escape', async (t) => {
  const { page, shadow, errors } = await compose(t);
  await page.locator('#compose').click();
  await shadow('.trigger').click();
  await expect(shadow('.template')).toHaveCount(2);
  await expect(page.locator('#compose')).not.toBeFocused();
  await page.evaluate(() => { window.searchNode = document.getElementById('mail-template-vault-assistant').shadowRoot.querySelector('.search'); });
  await shadow('.search').pressSequentially('pitch');
  await expect(shadow('.template')).toHaveCount(1);
  // The same input survives, so the caret cannot jump while typing.
  assert.equal(await page.evaluate(() => window.searchNode.isConnected), true);
  await shadow('.search').press('Escape');
  await expect(shadow('.panel')).toBeHidden();
  await expect(page.locator('#compose')).toBeFocused();
  await shadow('.trigger').click();
  await expect(shadow('.template')).toHaveCount(2);
  await shadow('.search').press('ArrowDown');
  await shadow('.search').press('Enter');
  await expect(page.locator('#compose')).toContainText('Beta body text');
  await expect(shadow('.panel')).toBeHidden();
  await expect(shadow('.pill')).toHaveText('Inserted: Beta pitch');
  assert.deepEqual(errors, []);
});

test('picker cards stay inside the panel and clicking outside closes it', async (t) => {
  const { page, shadow } = await compose(t);
  await page.locator('#compose').click();
  await shadow('.trigger').click();
  await expect(shadow('.template')).toHaveCount(2);
  const [list, card] = await Promise.all([shadow('.list').boundingBox(), shadow('.template').first().boundingBox()]);
  assert.ok(card.x + card.width <= list.x + list.width + 1, 'card overflows the list');
  await page.mouse.click(1050, 700);
  await expect(shadow('.panel')).toBeHidden();
});

test('the compose button leaves when the email closes and follows the setting', async (t) => {
  const { page, shadow } = await compose(t);
  await page.locator('#compose').click();
  await expect(shadow('.trigger')).toBeVisible();
  await page.evaluate(() => window.contentMessageListener(
    { type: 'ETM_PREFERENCES_CHANGED', preferences: { interfaceMode: 'popover', inlineButton: false } }, { id: 'test-extension' }, () => {}));
  await expect(shadow('.trigger')).toBeHidden();
  await page.evaluate(() => window.contentMessageListener(
    { type: 'ETM_PREFERENCES_CHANGED', preferences: { interfaceMode: 'inline', inlineButton: false } }, { id: 'test-extension' }, () => {}));
  await expect(shadow('.trigger')).toBeVisible();
  await page.evaluate(() => document.getElementById('compose').remove());
  await expect(shadow('.trigger')).toBeHidden({ timeout: 2000 });
});

test('the toolbar in Inline mode explains itself when no email is open', async (t) => {
  const { page, shadow } = await compose(t);
  await page.evaluate(() => document.getElementById('compose').remove());
  await page.evaluate(() => window.contentMessageListener({ type: 'ETM_TOGGLE_INLINE' }, { id: 'test-extension' }, () => {}));
  await expect(shadow('.pill')).toContainText('Click inside an email body');
});

test('the toolbar in Inline mode opens the picker for an open email', async (t) => {
  const { page, shadow } = await compose(t);
  await page.locator('#compose').click();
  await page.evaluate(() => window.contentMessageListener({ type: 'ETM_TOGGLE_INLINE' }, { id: 'test-extension' }, () => {}));
  await expect(shadow('.panel')).toBeVisible();
  await expect(shadow('.template')).toHaveCount(2);
});

async function signInPage(t, loginResponse) {
  const context = await browser.newContext({ viewport: { width: 380, height: 720 } });
  t.after(() => context.close());
  await context.addInitScript(({ loginResponse, templates }) => {
    const store = {};
    window.store = store;
    window.loginCalls = 0;
    window.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/auth/login')) {
        window.loginCalls += 1;
        window.loginBody = JSON.parse(options.body);
        return new Response(JSON.stringify(loginResponse.body), { status: loginResponse.status, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).endsWith('/api/auth/logout')) return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      return store.mtv_api_auth_v1
        ? new Response(JSON.stringify({ user: loginResponse.body.user }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };
    window.chrome = {
      runtime: {
        id: 'test-extension',
        getURL: (name) => new URL(name, location.href).href,
        sendMessage: async (message) => {
          if (message.type === 'ETM_STORAGE') return store.mtv_api_auth_v1 ? { ok: true, result: { templates, remote: true } } : { ok: false, error: 'Sign in to access shared templates.' };
          if (message.type === 'ETM_PREFERENCES_GET') return { ok: true, result: { interfaceMode: 'popover', inlineButton: true, closeAfterInsert: false, sortOrder: 'name' } };
          return { ok: true };
        },
        onMessage: { addListener() {} }
      },
      storage: {
        local: {
          get: async (key) => (key in store ? { [key]: store[key] } : {}),
          set: async (value) => { Object.assign(store, value); },
          remove: async (key) => { delete store[key]; }
        },
        onChanged: { addListener() {} }
      },
      tabs: { query: async () => [{ id: 1 }], create() {}, sendMessage: async () => ({ ok: true }) }
    };
  }, { loginResponse, templates: TEMPLATES });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/sidepanel.html`);
  await page.locator('#showSignInBtn').click();
  await page.locator('#authEmail').fill('person@example.com');
  await page.locator('#authPassword').fill('fixture-value-1');
  await page.locator('#authSubmitBtn').click();
  return { page, errors };
}

test('signing in stores the session and shows the templates', async (t) => {
  const { page, errors } = await signInPage(t, { status: 200, body: { token: 'fixture-token', user: { email: 'person@example.com', displayName: 'Person', mustChangePassword: false } } });
  await expect(page.locator('.template-card')).toHaveCount(2);
  await expect(page.locator('#signedOutView')).toBeHidden();
  assert.equal(await page.evaluate(() => window.store.mtv_api_auth_v1.token), 'fixture-token');
  assert.equal(await page.evaluate(() => window.loginBody.client), 'extension');
  assert.deepEqual(errors, []);
});

test('a refused sign-in shows the reason and lets you try again', async (t) => {
  const { page } = await signInPage(t, { status: 401, body: { error: 'Email or password is incorrect.' } });
  await expect(page.locator('#authError')).toHaveText('Email or password is incorrect.');
  await expect(page.locator('#authSubmitBtn')).toBeEnabled();
  await expect(page.locator('#authForm')).toBeVisible();
});

test('a temporary password explains what to do and keeps the form open', async (t) => {
  const { page } = await signInPage(t, { status: 200, body: { token: 'fixture-token', user: { email: 'person@example.com', displayName: 'Person', mustChangePassword: true } } });
  await expect(page.locator('#authError')).toContainText('Change your temporary password');
  await expect(page.locator('#authForm')).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.store.mtv_api_auth_v1)), false);
});

test('a network failure with a saved session offers a retry, not a sign-in', async (t) => {
  const context = await browser.newContext({ viewport: { width: 380, height: 720 } });
  t.after(() => context.close());
  await context.addInitScript(() => {
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    window.chrome = {
      runtime: { id: 'x', getURL: (n) => n, sendMessage: async (m) => (m.type === 'ETM_STORAGE' ? { ok: false, error: 'The private API is unavailable.' } : { ok: false }), onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({ mtv_api_auth_v1: { token: 'saved' } }), set: async () => {}, remove: async () => { window.tokenRemoved = true; } }, onChanged: { addListener() {} } },
      tabs: { query: async () => [{ id: 1 }], create() {}, sendMessage: async () => ({ ok: true }) }
    };
  });
  const page = await context.newPage();
  await page.goto(`${base}/sidepanel.html`);
  await expect(page.locator('#errorState')).toBeVisible();
  await expect(page.locator('#signedOutView')).toBeHidden();
  assert.equal(await page.evaluate(() => Boolean(window.tokenRemoved)), false);
});

test('a session ended elsewhere clears the list and asks you to sign in', async (t) => {
  const { page } = await open(t, 'sidepanel.html');
  await expect(page.locator('.template-card')).toHaveCount(2);
  await page.evaluate(() => {
    window.fetch = async () => new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    chrome.runtime.sendMessage = async (m) => (m.type === 'ETM_STORAGE' ? { ok: false, error: 'Your session has ended. Sign in again to load your templates.' } : { ok: true });
    document.getElementById('syncBtn').click();
  });
  await expect(page.locator('#signedOutView')).toBeVisible();
  await expect(page.locator('.template-card')).toHaveCount(0);
});

test('the picker drops saved templates once signed out, and its button survives a silent focus change', async (t) => {
  const { page, shadow } = await compose(t);
  await page.locator('#compose').click();
  await shadow('.trigger').click();
  await expect(shadow('.template')).toHaveCount(2);
  await shadow('.search').press('Escape');
  await page.evaluate(() => { chrome.runtime.sendMessage = async () => ({ ok: false, error: 'Your session has ended. Sign in again to load your templates.' }); });
  await shadow('.trigger').click();
  await expect(shadow('.sign-in')).toBeVisible();
  await expect(shadow('.template')).toHaveCount(0);
  await page.evaluate(() => {
    const body = document.getElementById('compose');
    body.replaceWith(body.cloneNode(true));
  });
  await expect(shadow('.trigger')).toBeHidden({ timeout: 2000 });
  await page.evaluate(() => {
    const swallow = (event) => event.stopImmediatePropagation();
    window.addEventListener('focusin', swallow, true);
    document.getElementById('compose').focus();
    window.removeEventListener('focusin', swallow, true);
  });
  await expect(shadow('.trigger')).toBeVisible({ timeout: 2000 });
});

test('a signed-out inline picker offers a working way to sign in', async (t) => {
  const { page, shadow } = await compose(t);
  await page.evaluate(() => {
    window.sentMessages = [];
    chrome.runtime.sendMessage = async (message) => {
      window.sentMessages.push(message.type);
      return message.type === 'ETM_CONTEXT_TEMPLATES' ? { ok: false, error: 'Sign in to access shared templates.' } : { ok: true };
    };
  });
  await page.locator('#compose').click();
  await shadow('.trigger').click();
  await expect(shadow('.error')).toHaveText('Sign in to access shared templates.');
  await shadow('.sign-in').click();
  assert.ok((await page.evaluate(() => window.sentMessages)).includes('ETM_OPEN_SIGN_IN'));
  await expect(shadow('.panel')).toBeHidden();
});

test('only Outlook pages can ask to open the sign-in page', async () => {
  const worker = loadWorker();
  let created = null;
  worker.chrome.tabs.create = async (value) => { created = value; return {}; };
  assert.equal(worker.send({ type: 'ETM_OPEN_SIGN_IN' }, { id: 'other', tab: { url: OUTLOOK } }) instanceof Promise, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(created, null);
  await worker.send({ type: 'ETM_OPEN_SIGN_IN' }, { id: 'vault', url: OUTLOOK, tab: { url: OUTLOOK } });
  assert.equal(created.url, 'chrome-extension://vault/sidepanel.html?signin=1');
});

test('Settings shows the saved interface, saves changes and locks options that do not apply', async (t) => {
  const { page, errors } = await open(t, 'settings.html', { viewport: { width: 1000, height: 900 } });
  await expect(page.locator('input[value="popover"]')).toBeChecked();
  await expect(page.locator('#sidePanelNote')).toBeHidden();
  await page.locator('.mode-card', { hasText: 'Side Panel' }).click();
  await expect(page.locator('input[value="sidepanel"]')).toBeChecked();
  await expect(page.locator('#sidePanelNote')).toBeVisible();
  await expect(page.locator('#saveStatus')).toBeVisible();
  await expect(page.locator('#closeAfterInsert')).toBeDisabled();
  assert.equal(await page.evaluate(() => window.storedPreferences.interfaceMode), 'sidepanel');
  await page.locator('#openChromeSettingsBtn').click();
  assert.equal((await page.evaluate(() => window.created))[0], 'chrome://settings/appearance');
  await page.locator('.mode-card', { hasText: 'Inline Editor' }).click();
  await expect(page.locator('#inlineButton')).toBeChecked();
  await expect(page.locator('#inlineButton')).toBeDisabled();
  await page.locator('.mode-card', { hasText: 'Popover' }).click();
  await expect(page.locator('#closeAfterInsert')).toBeEnabled();
  await page.locator('label[for="closeAfterInsert"]').click();
  assert.equal(await page.evaluate(() => window.storedPreferences.closeAfterInsert), true);
  assert.deepEqual(errors, []);
});

test('Settings fits a narrow window with no sideways scrolling', async (t) => {
  const { page } = await open(t, 'settings.html', { viewport: { width: 360, height: 800 } });
  await expect(page.locator('input[value="popover"]')).toBeChecked();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
