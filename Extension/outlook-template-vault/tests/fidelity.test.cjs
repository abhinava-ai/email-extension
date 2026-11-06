// Follows a template the whole way: editor, then the server's cleaning, then the email.
// Compose stand-ins here behave like real Outlook: paste keeps styles and insertHTML loses them.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const appRoot = path.resolve(root, '..', '..', 'App', 'mail-template-vault');
const appSanitizer = path.join(appRoot, 'lib', 'template-sanitizer.js');
let browser;
let server;
let base;
let cleanTemplateHtml;

before(async () => {
  ({ cleanTemplateHtml } = await import(pathToFileURL(path.join(appRoot, 'lib', 'templates.ts')).href));
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').pathname.slice(1);
    if (name === 'blank.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><body></body></html>');
      return;
    }
    if (name === 'strict.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // The same arrangement as Outlook: a default policy that deletes style attributes.
      res.end(`<!doctype html><html><body><script>trustedTypes.createPolicy('default', {
        createHTML: (value) => value.replace(/\\sstyle\\s*=\\s*("[^"]*"|'[^']*')/gi, ''),
        createScript: (value) => value, createScriptURL: (value) => value });</script></body></html>`);
      return;
    }
    const file = path.join(root, name);
    if (!/^[a-z-]+\.js$/.test(name) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

function metrics(rootElement) {
  const properties = ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'fontStyle', 'color', 'backgroundColor', 'textDecorationLine', 'textAlign',
    'marginTop', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingLeft', 'listStyleType', 'verticalAlign', 'borderCollapse',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderLeftWidth'];
  return [...rootElement.querySelectorAll('p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,table,td,th,hr,a,strong,em,u,s,span,sub,sup,img')].map((node) => {
    const style = getComputedStyle(node);
    return { tag: node.tagName, text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), ...Object.fromEntries(properties.map((key) => [key, style[key]])) };
  });
}

const RICH = '<style>p.MsoNormal{margin:0pt 0pt 12pt;font-family:Georgia,serif;font-size:11pt;line-height:150%;color:#242424}</style>' +
  '<h2>Heading two</h2><h5>Heading five</h5>' +
  '<p class="MsoNormal">Word paragraph with <b>bold</b>, <i>italic</i>, <u>underline</u>, <s>strike</s>, H<sub>2</sub>O and x<sup>2</sup>.</p>' +
  '<p style="text-align:center;line-height:18px;margin-bottom:24px;text-indent:10px">Centred <a href="https://example.com/a">a link</a> and <span style="background-color:#ffff00;color:rgb(200,0,0);font-size:16pt">highlight</span>.</p>' +
  '<ul style="padding-left:40px;list-style-type:square"><li style="margin-bottom:4px">Square item</li></ul>' +
  '<ol start="3" style="list-style-type:lower-roman"><li>Roman item</li></ol>' +
  '<blockquote>Quoted line</blockquote>' +
  '<table width="400" cellpadding="4" cellspacing="0" border="1" style="border-collapse:collapse;width:400px"><tr>' +
  '<td style="border:2px dashed rgb(255,0,0);padding:8px 12px;background-color:#ffeeaa;vertical-align:middle;width:120px">Cell one</td>' +
  '<td style="border-left:1px solid #000;padding-left:6px;text-align:right">Cell two</td></tr></table><hr>' +
  '<p>After the rule <img src="https://example.com/i.png" width="20" height="20" alt="pic" style="width:20px;height:20px"></p>' +
  '<p>Embedded <img src="data:image/png;base64,iVBORw0KGgo=" alt="dot"></p>';

async function setup(t) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${base}/blank.html`);
  await page.addScriptTag({ url: `${base}/sanitizer.js` });
  await page.addScriptTag({ content: 'window.TemplateSanitizer = TemplateSanitizer;' });
  return page;
}

// Styles Outlook's own compose area applies, which inline styles have to override.
const OUTLOOK_CSS = '#compose{font:16px "Segoe UI";color:rgb(66,66,66)} #compose p{margin:0;font-size:24px;color:purple} #compose ul{padding-left:60px} #compose a{color:rgb(0,0,238)} #compose td{padding:1px}';

test('the template looks the same in the editor, after the server, and in the email', async (t) => {
  const page = await setup(t);
  const editorHtml = await page.evaluate((html) => TemplateSanitizer.sanitizePaste(html), RICH);
  const saved = cleanTemplateHtml(editorHtml);
  const result = await page.evaluate(`(() => { window.metricsFn = ${metrics.toString()};
    document.head.insertAdjacentHTML('beforeend', '<style>' + TemplateSanitizer.editorDefaultsCss('#editor') + ${JSON.stringify(OUTLOOK_CSS)} + '</style>');
    document.body.insertAdjacentHTML('beforeend', '<div id="editor">' + ${JSON.stringify(editorHtml)} + '</div><div id="compose"></div>');
    document.getElementById('compose').innerHTML = TemplateSanitizer.toEmailHtml(${JSON.stringify(saved)});
    return { editor: metricsFn(document.getElementById('editor')), email: metricsFn(document.getElementById('compose')) };
  })()`);
  assert.ok(result.editor.length > 20, 'expected the fixture to produce many elements');
  assert.deepEqual(result.email, result.editor);
});

test('formatting survives on a page whose security policy blocks style attributes, like Outlook', async (t) => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${base}/strict.html`);
  await page.addScriptTag({ url: `${base}/sanitizer.js` });
  const result = await page.evaluate(() => {
    const probe = new DOMParser().parseFromString(trustedTypes.defaultPolicy.createHTML('<p style="color:red">x</p>'), 'text/html').querySelector('p');
    const original = DOMParser.prototype.parseFromString;
    // Applies the policy here too, because this test page requires no CSP header to reach it.
    DOMParser.prototype.parseFromString = function (value, type) { return original.call(this, trustedTypes.defaultPolicy.createHTML(String(value)).toString(), type); };
    const html = TemplateSanitizer.toEmailHtml('<p style="font-family:Georgia,serif;font-size:14pt;color:rgb(200,0,0);margin-bottom:24px">Hello <span style="background-color:rgb(255,255,0)">there</span></p>');
    DOMParser.prototype.parseFromString = original;
    return { policyActive: probe.style.color === '', html };
  });
  assert.equal(result.policyActive, true, 'the test page must really block style attributes');
  for (const expected of ['Georgia', '14pt', 'rgb(200, 0, 0)', '24px', 'background-color:rgb(255, 255, 0)']) {
    assert.ok(result.html.replace(/: /g, ':').includes(expected.replace(/: /g, ':')), `lost ${expected}: ${result.html}`);
  }
});

test('the server keeps every kind of formatting the editor can produce', () => {
  const kept = cleanTemplateHtml('<p style="margin:0px 0px 14px;padding-left:26px;line-height:18px;text-decoration-line:underline;font-family:Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif">x</p>' +
    '<ul style="list-style-type:square;list-style-position:outside"><li>x</li></ul>' +
    '<table width="400" cellpadding="4" cellspacing="0" border="1" style="border-collapse:collapse;border-spacing:0px"><tr><td width="50" colspan="2" style="border-top:1px solid rgb(255, 0, 0);vertical-align:top;width:50px;height:20px">x</td></tr></table>' +
    '<h5>x</h5><h6>x</h6>H<sub>2</sub>O x<sup>2</sup><ol start="3"><li>x</li></ol>');
  for (const expected of ['margin:0px 0px 14px', 'padding-left:26px', 'line-height:18px', 'text-decoration-line:underline', 'Aptos_EmbeddedFont',
    'list-style-type:square', 'width="400"', 'cellpadding="4"', 'border-collapse:collapse', 'border-top:1px solid rgb(255, 0, 0)', 'vertical-align:top',
    '<h5>', '<h6>', '<sub>', '<sup>', 'start="3"', 'colspan="2"']) {
    assert.ok(kept.includes(expected), `lost: ${expected}\n${kept}`);
  }
});

test('the server still removes anything dangerous', () => {
  const dirty = cleanTemplateHtml('<p style="background-image:url(https://evil.example/t.png);position:fixed;color:red" onclick="x()">a</p>' +
    '<script>alert(1)</script><a href="javascript:alert(1)">b</a><img src="data:text/html;base64,PHNjcmlwdD4=" alt="c">' +
    '<td style="border:1px solid url(https://evil.example/t.png)">d</td><p style="width:expression(alert(1));font-family:x;}body{display:none">e</p>');
  assert.doesNotMatch(dirty, /url\(|position|onclick|<script|javascript:|data:text|expression/i);
  assert.match(dirty, /color:red/);
});

test('Outlook-style compose: inserting goes through its paste handler, and undo and redo work', async (t) => {
  const page = await setup(t);
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'x', sendMessage: async () => ({ ok: false }), onMessage: { addListener: (fn) => { window.listener = fn; } } } };
    document.body.innerHTML = '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message body" style="width:600px;height:300px">Before </div>';
    const editor = document.getElementById('compose');
    // Mirrors what real Outlook did in testing: it handles paste itself, a moment later,
    // keeps a history stack, and strips styles from anything that bypasses it.
    window.pastes = [];
    window.commands = 0;
    const stack = [];
    let future = [];
    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      const html = event.clipboardData.getData('text/html');
      window.pastes.push(html);
      stack.push(editor.innerHTML);
      setTimeout(() => editor.insertAdjacentHTML('beforeend', html), 100);
    });
    editor.addEventListener('keydown', (event) => {
      if (!event.ctrlKey) return;
      if (event.key === 'z' && stack.length) { event.preventDefault(); future.push(editor.innerHTML); editor.innerHTML = stack.pop(); }
      if (event.key === 'y' && future.length) { event.preventDefault(); stack.push(editor.innerHTML); editor.innerHTML = future.pop(); }
    });
    const original = document.execCommand.bind(document);
    document.execCommand = (...args) => { window.commands += 1; return original(...args); };
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.locator('#compose').click();
  const result = await page.evaluate(() => new Promise((resolve) => window.listener(
    { type: 'ETM_INSERT_TEMPLATE', html: '<p style="margin-bottom:14px">Pasted <a href="https://example.com">link</a></p>' }, { id: 'x' }, resolve)));
  assert.equal(result.ok, true);
  assert.equal(await page.evaluate(() => window.commands), 0, 'must not use insertHTML when Outlook handles paste');
  assert.match(await page.evaluate(() => window.pastes[0]), /margin:\s*0px 0px 14px/);
  await expect(page.locator('#compose')).toContainText('Pasted');
  await page.locator('#compose').press('Control+z');
  await expect(page.locator('#compose')).toHaveText('Before ');
  await page.locator('#compose').press('Control+y');
  await expect(page.locator('#compose')).toContainText('Pasted');
});

test('fonts, sizes, colours and highlights Outlook flattens on paste are restored, also after redo', async (t) => {
  const page = await setup(t);
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'x', sendMessage: async () => ({ ok: false }), onMessage: { addListener: (fn) => { window.listener = fn; } } } };
    document.body.innerHTML = '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:600px;min-height:300px;font:16px Arial;color:rgb(0,0,0)"></div>';
    const editor = document.getElementById('compose');
    // Behaves as real Outlook did: block spacing stays, text-level styles are dropped.
    const flatten = (html) => {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      for (const node of holder.querySelectorAll('*')) {
        for (const property of ['font-family', 'font-size', 'color', 'background-color', 'line-height']) node.style.removeProperty(property);
      }
      for (const node of holder.querySelectorAll('span,s,sub')) node.replaceWith(...node.childNodes);
      return holder.innerHTML;
    };
    const stack = [];
    let future = [];
    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      const html = flatten(event.clipboardData.getData('text/html'));
      stack.push(editor.innerHTML);
      setTimeout(() => { editor.insertAdjacentHTML('beforeend', html); window.flattened = editor.innerHTML; }, 50);
    });
    editor.addEventListener('keydown', (event) => {
      if (!event.ctrlKey) return;
      if (event.key === 'z' && stack.length) { event.preventDefault(); future.push(window.flattened); editor.innerHTML = stack.pop(); }
      if (event.key === 'y' && future.length) { event.preventDefault(); stack.push(editor.innerHTML); editor.innerHTML = future.pop(); }
    });
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.locator('#compose').click();
  const template = '<p style="margin-bottom:14px;font-family:Georgia,serif;font-size:14pt;color:rgb(36,36,36)">Plain Georgia <span style="background-color:rgb(255,255,0);font-size:20pt;color:rgb(0,0,200);font-family:Verdana">big highlight</span> <s>gone</s> H<sub>2</sub>O</p><p>Default words</p>';
  const check = () => page.evaluate(() => {
    const editor = document.getElementById('compose');
    const find = (text) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue.includes(text)) {
          const style = getComputedStyle(node.parentElement);
          return { font: style.fontFamily, size: style.fontSize, color: style.color, bg: style.backgroundColor, deco: style.textDecorationLine, va: style.verticalAlign, tag: node.parentElement.tagName };
        }
      }
      return null;
    };
    return { georgia: find('Plain Georgia'), highlight: find('big highlight'), strike: find('gone'), sub: find('2'), defaults: find('Default words'), text: editor.textContent };
  });
  const verify = (result) => {
    assert.match(result.georgia.font, /Georgia/);
    assert.equal(result.georgia.size, '18.6667px');
    assert.equal(result.georgia.color, 'rgb(36, 36, 36)');
    assert.equal(result.highlight.font, 'Verdana');
    assert.equal(result.highlight.size, '26.6667px');
    assert.equal(result.highlight.color, 'rgb(0, 0, 200)');
    assert.equal(result.highlight.bg, 'rgb(255, 255, 0)');
    assert.equal(result.strike.deco, 'line-through');
    assert.equal(result.sub.va, 'sub');
    assert.match(result.text, /Plain Georgia\s+big highlight\s+gone\s+H2O/);
  };
  const inserted = await page.evaluate((html) => new Promise((resolve) => window.listener({ type: 'ETM_INSERT_TEMPLATE', html }, { id: 'x' }, resolve)), template);
  assert.equal(inserted.ok, true);
  verify(await check());
  await page.locator('#compose').press('Control+z');
  await expect(page.locator('#compose')).toHaveText('');
  await page.locator('#compose').press('Control+y');
  await page.waitForTimeout(400);
  verify(await check());
});

test('an editor that ignores the paste reports failure instead of false success', async (t) => {
  const page = await setup(t);
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'x', sendMessage: async () => ({ ok: false }), onMessage: { addListener: (fn) => { window.listener = fn; } } } };
    document.body.innerHTML = '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:600px;height:300px">Before</div>';
    document.getElementById('compose').addEventListener('paste', (event) => event.preventDefault());
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.locator('#compose').click();
  const result = await page.evaluate(() => new Promise((resolve) => window.listener(
    { type: 'ETM_INSERT_TEMPLATE', html: '<p>Lost</p>' }, { id: 'x' }, resolve)));
  assert.equal(result.ok, false);
  assert.match(result.error, /did not accept/);
});

test('typing in the inline search box never reaches Outlook shortcuts, while typing in the email still does', async (t) => {
  const page = await setup(t);
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'x', sendMessage: async (m) => (m.type === 'ETM_CONTEXT_TEMPLATES' ? { ok: true, result: { templates: [{ id: 'a', name: 'Alpha', html: '<p>A</p>' }] } } : { ok: false }), onMessage: { addListener() {} } } };
    document.body.innerHTML = '<div id="compose" contenteditable="true" role="textbox" aria-multiline="true" style="width:600px;height:300px">Hi</div>';
    window.keysSeenByOutlook = [];
    document.addEventListener('keydown', (event) => window.keysSeenByOutlook.push(event.key));
  });
  await page.addScriptTag({ url: `${base}/content.js` });
  await page.locator('#compose').click();
  await page.keyboard.press('z');
  assert.deepEqual(await page.evaluate(() => window.keysSeenByOutlook), ['z'], 'keys in the email must stay untouched');
  await page.locator('#mail-template-vault-assistant .trigger').click();
  await page.locator('#mail-template-vault-assistant .search').pressSequentially('nr');
  assert.deepEqual(await page.evaluate(() => window.keysSeenByOutlook), ['z']);
});

test('the web app runs the same formatting engine as the extension', () => {
  const extension = fs.readFileSync(path.join(root, 'sanitizer.js'), 'utf8');
  assert.ok(fs.readFileSync(appSanitizer, 'utf8').includes(extension), 'Run: node scripts/sync-sanitizer.cjs');
});

test('defaults match the values read from real Outlook', async (t) => {
  const page = await setup(t);
  const style = await page.evaluate(() => TemplateSanitizer.editorStyle());
  assert.equal(style.fontFamily, 'Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif');
  assert.equal(style.fontSize, '12pt');
  assert.equal(style.lineHeight, 'normal');
  assert.equal(style.color, 'rgb(0, 0, 0)');
});
