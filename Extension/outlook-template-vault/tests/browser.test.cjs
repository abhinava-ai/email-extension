const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { createStorage, template } = require('./storage-fixture.cjs');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
let browser;
let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    if (!/^(?:[a-z-]+\.(?:html|js|css)|vendor\/jodit\/jodit\.min\.(?:js|css))$/.test(name)) {
      res.writeHead(404).end(); return;
    }
    const filename = path.join(root, name);
    if (!fs.existsSync(filename)) { res.writeHead(404).end(); return; }
    if (name === 'editor-sandbox.html') res.setHeader('Content-Security-Policy', manifest.content_security_policy.sandbox);
    else if (name.endsWith('.html')) res.setHeader('Content-Security-Policy', manifest.content_security_policy.extension_pages);
    res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript');
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

async function setup(t, { loadDelay = 0, saveDelay = 0, seed = [], failEditor = false } = {}) {
  const fixture = createStorage({ local: { etm_local_v1: { updatedAt: 1, templates: seed } } });
  const context = await browser.newContext({ viewport: { width: 1080, height: 820 } });
  t.after(() => context.close());
  let saveCount = 0;
  await context.exposeBinding('storageRequest', async (_, message) => {
    if (message.operation === 'load' && loadDelay) await new Promise((resolve) => setTimeout(resolve, loadDelay));
    if (message.operation === 'upsert') {
      saveCount += 1;
      if (saveDelay) await new Promise((resolve) => setTimeout(resolve, saveDelay));
    }
    try { return { ok: true, result: await fixture.api.dispatch(message.operation, message.payload) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  await context.addInitScript(() => {
    if (window !== window.top) return;
    window.chrome = {
      runtime: {
        id: 'test-extension',
        getURL: (name) => new URL(name, location.href).href,
        sendMessage: (message) => window.storageRequest(message),
        onMessage: { addListener: (fn) => { window.contentMessageListener = fn; } }
      },
      storage: { onChanged: { addListener() {} } },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ ok: true }) }
    };
  });
  const remoteRequests = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(base)) { remoteRequests.push(url); return route.abort(); }
    if (failEditor && url.endsWith('jodit.min.js')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { ...fixture, context, page, errors, remoteRequests, saves: () => saveCount };
}

async function ready(page, query = '') {
  await page.goto(`${base}/editor.html${query}`);
  await expect(page.locator('#saveBtn')).toBeEnabled();
  return page.frameLocator('#editorFrame').locator('.jodit-wysiwyg');
}

test('offline rich editor loads behind the loader, with both default textareas hidden', async (t) => {
  const { page, errors, remoteRequests } = await setup(t, { loadDelay: 500 });
  await page.goto(`${base}/editor.html`);
  await expect(page.locator('#saveBtn')).toBeDisabled();
  await expect(page.locator('#templateName')).toBeDisabled();
  await expect(page.locator('#editorFrame')).toHaveAttribute('src', 'about:blank');
  await expect(page.locator('#loaderError')).toBeHidden();
  await expect(page.locator('#templateBody')).toBeHidden();
  await expect(page.locator('#saveBtn')).toBeEnabled();
  await expect(page.locator('#editorLoader')).toBeHidden();
  await expect(page.locator('#templateBody')).toBeHidden();
  await expect(page.frameLocator('#editorFrame').locator('#sandboxEditor')).toBeHidden();
  await expect(page.frameLocator('#editorFrame').locator('.jodit-wysiwyg')).toBeVisible();
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'editor.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
});

test('save shortcut works inside Jodit; overlapping saves are locked and subsequent edits remain dirty', async (t) => {
  const { page, saves, api } = await setup(t, { saveDelay: 500 });
  const rich = await ready(page);
  await page.locator('#templateName').fill('My template');
  await rich.fill('First draft');
  await rich.press('Control+s');
  await expect(page.locator('#saveBtn')).toBeDisabled();
  await rich.press('Control+s');
  await rich.fill('Changes made during save');
  await expect(page.locator('#saveBtn')).toBeEnabled();
  assert.equal(saves(), 1);
  await expect(page.locator('#saveState')).toHaveText('New changes remain unsaved');
  await expect(rich).toHaveText('Changes made during save');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveState')).toContainText('Saved •');
  const stored = (await api.load()).templates;
  assert.equal(stored.length, 1);
  assert.match(stored[0].html, /Changes made during save/);
});

test('fallback requires explicit selection and ignores stale ready messages; empty drafts do not resurrect content', async (t) => {
  const { page, api } = await setup(t, { failEditor: true, seed: [template('existing', '<p>Old content</p>')] });
  await page.goto(`${base}/editor.html?id=existing`);
  await expect(page.locator('#loaderError')).toBeVisible();
  await expect(page.locator('#loaderBusy')).toBeHidden();
  await expect(page.locator('#templateBody')).toBeHidden();
  await page.locator('#useFallbackBtn').click();
  await expect(page.locator('#templateBody')).toBeVisible();
  await expect(page.locator('#editorFrame')).toBeHidden();
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { source: document.getElementById('editorFrame').contentWindow,
      data: { channel: 'MAIL_TEMPLATE_VAULT_EDITOR', direction: 'sandbox-to-parent', type: 'READY', session: '' } }));
  });
  await expect(page.locator('#templateBody')).toBeVisible();
  await page.locator('#templateBody').fill('');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#formError')).toHaveText('Please enter some email content.');
  assert.equal((await api.load()).templates[0].html, '<p>Old content</p>');
});

test('unsaved changes trigger the native unload guard', async (t) => {
  const { page } = await setup(t);
  await ready(page);
  await page.locator('#templateName').fill('Unsaved');
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }), true);
});

test('sanitization preserves spacing, quoted fonts, tables, and safe formatting while removing active content', async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sidepanel.html`);
  const result = await page.evaluate(() => {
    const input = '<p style="font-family:&quot;Segoe UI&quot;, Arial;font-size:12px">Hello</p><p><br></p>' +
      '<strong>one</strong> <em>two</em>' +
      '<table style="width:80%;border-collapse:collapse"><tr><td style="border:1px solid red;padding:8px;background-color:#ffeeaa">Cell</td></tr></table>' +
      '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">Bad</a>';
    const html = TemplateSanitizer.sanitize(input);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      html, again: TemplateSanitizer.sanitize(html), font: doc.querySelector('p').style.fontFamily,
      size: doc.querySelector('p').style.fontSize, blank: Boolean(doc.querySelector('p + p > br')),
      cell: doc.querySelector('td').getAttribute('style'), width: doc.querySelector('table').style.width,
      inlineText: doc.querySelector('strong').parentElement.textContent,
      unsafe: Boolean(doc.querySelector('script,[onerror],a[href^="javascript:"]'))
    };
  });
  assert.match(result.font, /Segoe UI/);
  assert.equal(result.size, '12px');
  assert.equal(result.blank, true);
  assert.equal(result.inlineText, 'one two');
  assert.match(result.cell, /border-top:1px solid/);
  assert.match(result.cell, /background-color/);
  assert.match(result.cell, /padding-top:8px/);
  assert.equal(result.width, '80%');
  assert.equal(result.unsafe, false);
  assert.equal(result.again, result.html);
});

test('existing pixel font sizes are not migrated on open or save', async (t) => {
  const { page, api } = await setup(t, { seed: [template('px', '<p style="font-size:12px">Original</p>')] });
  await ready(page, '?id=px');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveState')).toContainText('Saved •');
  assert.match((await api.load()).templates[0].html, /font-size:\s*12px/);
});

test('source-mode edits are saved immediately with the keyboard shortcut', async (t) => {
  const { page, api, errors } = await setup(t);
  await ready(page);
  await page.locator('#templateName').fill('Source draft');
  const frame = page.frames().find((frame) => frame.url().includes('editor-sandbox.html'));
  await frame.evaluate(() => Object.values(Jodit.instances)[0].setMode(Jodit.MODE_SOURCE));
  const source = frame.locator('.jodit-source textarea');
  await expect(source).toBeVisible();
  await source.fill('<p style="font-size:16pt">Source content</p>');
  await source.press('Control+s');
  await expect(page.locator('#saveState')).toContainText('Saved •');
  assert.match((await api.load()).templates[0].html, /Source content/);
  assert.match((await api.load()).templates[0].html, /font-size:\s*16pt/);
  await frame.evaluate(() => new Promise((resolve) => setTimeout(resolve, Object.values(Jodit.instances)[0].defaultTimeout + 100)));
  await expect(page.locator('#saveState')).toContainText('Saved •');
  assert.deepEqual(errors, []);
});

test('an unresponsive editor fails the save without storing stale cached content', async (t) => {
  const { page, api } = await setup(t);
  const rich = await ready(page);
  await page.locator('#templateName').fill('Do not save stale data');
  await rich.fill('Draft');
  // Simulate an iframe that stopped running its message handler.
  await page.locator('#editorFrame').evaluate((frame) => new Promise((resolve) => {
    frame.onload = resolve;
    frame.src = 'about:blank';
  }));
  await page.locator('#saveBtn').click();
  await expect(page.locator('#formError')).toContainText('did not respond');
  assert.equal((await api.load()).templates.length, 0);
});

test('insertion inherits explicit parent typography instead of resetting children to defaults', async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sidepanel.html`);
  const sizes = await page.evaluate(() => {
    const html = TemplateSanitizer.toEmailHtml('<div style="font-size:20pt;font-family:Georgia;line-height:28pt"><p>Text</p><ul><li>Item</li></ul></div>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('p,li')].map((node) => [node.style.fontSize, node.style.fontFamily, node.style.lineHeight]);
  });
  assert.deepEqual(sizes, [['20pt', 'Georgia', '28pt'], ['20pt', 'Georgia', '28pt']]);
});

test('Outlook insertion rejects ambiguous bodies and uses the selected body and caret', async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sidepanel.html`);
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="search" contenteditable="true" style="width:400px;height:60px">Search</div>' +
      '<div id="first" contenteditable="true" role="textbox" aria-multiline="true" style="width:400px;height:100px">First</div>' +
      '<div id="second" contenteditable="true" role="textbox" aria-multiline="true" style="width:400px;height:100px">AB</div>';
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  const insert = () => page.evaluate(() => new Promise((resolve) => window.contentMessageListener(
    { type: 'ETM_INSERT_TEMPLATE', html: '<p>Inserted</p>' }, { id: 'test-extension' }, resolve)));
  assert.equal((await insert()).ok, false);
  await page.locator('#second').focus();
  await page.evaluate(() => {
    const text = document.getElementById('second').firstChild;
    const range = document.createRange(); range.setStart(text, 1); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  assert.equal((await insert()).ok, true);
  await expect(page.locator('#first')).toHaveText('First');
  await expect(page.locator('#search')).toHaveText('Search');
  await expect(page.locator('#second')).toContainText('Inserted');
  const text = await page.locator('#second').textContent();
  assert.equal(text, 'AInsertedB');
});

test('contextual assistant appears only for compose editors and inserts a selected template without sending', async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sidepanel.html`);
  await page.evaluate(() => {
    document.body.innerHTML = '<button id="nativeSend">Send</button>' +
      '<input id="subject" aria-label="Subject">' +
      '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:500px;height:180px">Hello</div>';
    window.sendClicks = 0;
    document.getElementById('nativeSend').addEventListener('click', () => { window.sendClicks += 1; });
    chrome.runtime.sendMessage = async (message) => message.type === 'ETM_CONTEXT_TEMPLATES'
      ? { ok: true, result: { templates: [{ id: 'welcome', name: 'Welcome', html: '<p>Welcome aboard</p>' }] } }
      : { ok: false, error: 'Unexpected request' };
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.locator('#subject').focus();
  assert.equal(await page.evaluate(() => document.getElementById('mail-template-vault-assistant')?.shadowRoot.querySelector('.trigger').hidden), true);
  await page.locator('#compose').focus();
  assert.equal(await page.evaluate(() => document.getElementById('mail-template-vault-assistant').shadowRoot.querySelector('.trigger').hidden), false);
  await page.evaluate(() => document.getElementById('mail-template-vault-assistant').shadowRoot.querySelector('.trigger').click());
  await page.waitForFunction(() => document.getElementById('mail-template-vault-assistant').shadowRoot.querySelector('.template'));
  await page.evaluate(() => document.getElementById('mail-template-vault-assistant').shadowRoot.querySelector('.template').click());
  await expect(page.locator('#compose')).toContainText('Welcome aboard');
  assert.equal(await page.evaluate(() => window.sendClicks), 0);
});

function formattingMetrics(root) {
  const view = root.ownerDocument.defaultView;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const text = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent.replace(/\s+/g, ' ').trim();
    if (!value || ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) continue;
    const style = view.getComputedStyle(node.parentElement);
    text.push({ text: value, font: style.fontFamily, size: style.fontSize, height: style.lineHeight,
      weight: style.fontWeight, italic: style.fontStyle, color: style.color,
      background: style.backgroundColor, decoration: style.textDecorationLine });
  }
  const blocks = [...root.querySelectorAll('p,ul,ol,li')].map((element) => {
    const style = view.getComputedStyle(element);
    return { tag: element.tagName, text: element.textContent.replace(/\s+/g, ' ').trim(),
      top: style.marginTop, bottom: style.marginBottom, left: style.marginLeft,
      padding: style.paddingLeft, list: style.listStyleType };
  });
  return { text, blocks };
}

test('document formatting survives real paste, save, reopen, and insertion into a differently styled compose body', async (t) => {
  const { page, context, api, errors } = await setup(t);
  const rich = await ready(page);
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'document-paste.html'), 'utf8');
  await rich.focus();
  await rich.evaluate((element, html) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', html);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, fixture);
  await expect(rich).toContainText('Techgenyz');
  const pasted = await rich.evaluate(formattingMetrics);
  const greeting = pasted.text.find((item) => item.text === 'Hi,');
  assert.match(greeting.font, /Segoe UI/);
  assert.equal(greeting.size, '14.6667px');
  assert.equal(greeting.height, '22px');
  assert.equal(pasted.blocks.find((item) => item.text === 'Hi,').bottom, '16px');
  assert.equal(pasted.text.find((item) => item.text === 'Note:').size, '13.3333px');
  assert.equal(pasted.text.find((item) => item.text === 'rel="sponsored"').background, 'rgb(255, 255, 0)');
  assert.equal(pasted.text.find((item) => item.text === 'Sample article').color, 'rgb(176, 32, 64)', await rich.locator('a').first().evaluate((node) => node.outerHTML));
  assert.equal(pasted.text.find((item) => item.text === 'Sample article').decoration, 'none');
  assert.equal(pasted.text.find((item) => item.text === '$300').weight, '700');
  await page.locator('#templateName').fill('Formatting reference');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveState')).toContainText('Saved •');
  const saved = (await api.load()).templates[0];
  const reopened = await context.newPage();
  const reopenedRich = await ready(reopened, `?id=${saved.id}`);
  assert.deepEqual(await reopenedRich.evaluate(formattingMetrics), pasted);
  const compose = await context.newPage();
  await compose.goto(`${base}/sidepanel.html`);
  await compose.evaluate(() => {
    document.body.innerHTML = '<style>#compose {font-family:Times New Roman;font-size:22px;line-height:2;color:green} #compose p, #compose li {font-family:Courier New;font-size:24px;line-height:2;color:purple;margin-bottom:30px}</style><div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:800px;min-height:600px;background:white;padding:24px"></div>';
  });
  await compose.addScriptTag({ url: `${base}/content.js` });
  const inserted = await compose.evaluate((html) => new Promise((resolve) => window.contentMessageListener(
    { type: 'ETM_INSERT_TEMPLATE', html }, { id: 'test-extension' }, resolve)), saved.html);
  assert.equal(inserted.ok, true);
  assert.deepEqual(await compose.locator('#compose').evaluate(formattingMetrics), pasted);
  await reopened.screenshot({ path: path.join(root, 'test-results', 'formatting-editor.png'), fullPage: true });
  await compose.screenshot({ path: path.join(root, 'test-results', 'formatting-inserted.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('source styles preserve explicit normal/black/white overrides and relative typography without unsafe CSS', async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sidepanel.html`);
  const result = await page.evaluate(() => {
    const html = TemplateSanitizer.sanitizePaste('<style>p { font-size:14pt } .reset {color:black;background:white;font-weight:normal;font-style:normal} #styled {font-size:20pt} p {font-size:18pt} p:hover {position:fixed}</style>' +
      '<div style="font-size:10pt;color:red;font-weight:bold;font-style:italic"><p id="styled" style="font-size:12pt;margin-bottom:6pt;line-height:115%;background-image:url(https://example.com/tracker)">Parent <span style="font-size:150%">Relative</span> <strong class="reset">Reset</strong></p></div>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const p = doc.querySelector('p');
    const relative = doc.querySelector('span');
    const reset = doc.querySelector('strong');
    return { html, size: p.style.fontSize, margin: p.style.marginBottom, height: p.style.lineHeight,
      relative: relative.style.fontSize, reset: [reset.style.color, reset.style.backgroundColor, reset.style.fontWeight, reset.style.fontStyle],
      twice: TemplateSanitizer.prepareForEditor(html) };
  });
  assert.equal(result.size, '12pt');
  assert.equal(result.margin, '6pt');
  assert.equal(result.height, '18.4px');
  assert.equal(result.relative, '24px');
  assert.deepEqual(result.reset, ['black', 'white', 'normal', 'normal']);
  assert.doesNotMatch(result.html, /background-image|tracker|position:|<style|class=|id=/);
  assert.match(result.twice, /font-size:\s*24px/);
  assert.match(result.twice, /line-height:\s*18.4px/);
});

test('Jodit-authored font size and bold formatting match serialized email output', async (t) => {
  const { page, api } = await setup(t);
  const rich = await ready(page);
  await page.locator('#templateName').fill('Created in Jodit');
  await rich.fill('Selected text');
  const frame = page.frames().find((item) => item.url().includes('editor-sandbox.html'));
  await frame.evaluate(() => {
    const editor = Object.values(Jodit.instances)[0];
    editor.execCommand('selectall');
    editor.execCommand('fontsize', false, '16');
    editor.execCommand('bold');
    editor.synchronizeValues();
  });
  const before = await rich.evaluate(formattingMetrics);
  assert.equal(before.text[0].size, '21.3333px', await rich.innerHTML());
  assert.equal(before.text[0].weight, '700');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveState')).toContainText('Saved •');
  const saved = (await api.load()).templates[0];
  await frame.evaluate((html) => {
    const host = document.createElement('div');
    host.innerHTML = TemplateSanitizer.toEmailHtml(html);
    document.body.appendChild(host);
    host.id = 'comparison';
  }, saved.html);
  assert.deepEqual((await frame.locator('#comparison').evaluate(formattingMetrics)).text, before.text);
});

test('spaces in formatted runs survive paste, save, reopen, and email serialization without inventing separators', async (t) => {
  const { page, context, api } = await setup(t);
  const rich = await ready(page);
  const input = '<p><b>Sample post:</b><span style="font-family:Calibri"> </span><a href="https://example.com">https://example.com</a></p>' +
    '<p>Please see our<span style="font-size:12pt">&nbsp;</span><a href="https://example.com/payment"><b>Payment Guidelines</b></a><span style="color:black"> </span>here.</p>' +
    '<p><i>All paid links are published with<span style="font-size:10pt"> </span><span style="background-color:yellow">rel="sponsored"</span>.</i></p>' +
    '<p><b>Tech</b>genyz<strong>:</strong> no extra spaces.</p>';
  const expected = [
    'Sample post: https://example.com', 'Please see our Payment Guidelines here.',
    'All paid links are published with rel="sponsored".', 'Techgenyz: no extra spaces.'
  ];
  const paragraphText = (element) => [...element.querySelectorAll('p')]
    .map((p) => p.textContent.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  await rich.focus();
  await rich.evaluate((element, html) => {
    const clipboard = new DataTransfer(); clipboard.setData('text/html', html);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, input);
  assert.deepEqual(await rich.evaluate(paragraphText), expected);
  await page.locator('#templateName').fill('Separator regression');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveState')).toContainText('Saved •');
  const saved = (await api.load()).templates[0];
  const reopened = await context.newPage();
  const reopenedRich = await ready(reopened, `?id=${saved.id}`);
  assert.deepEqual(await reopenedRich.evaluate(paragraphText), expected);
  const compose = await context.newPage();
  await compose.goto(`${base}/sidepanel.html`);
  await compose.evaluate(() => {
    document.body.innerHTML = '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:800px;min-height:200px"></div>';
  });
  await compose.addScriptTag({ url: `${base}/content.js` });
  const inserted = await compose.evaluate((html) => new Promise((resolve) => window.contentMessageListener(
    { type: 'ETM_INSERT_TEMPLATE', html }, { id: 'test-extension' }, resolve)), saved.html);
  assert.equal(inserted.ok, true);
  assert.deepEqual(await compose.locator('#compose').evaluate(paragraphText), expected);
});
