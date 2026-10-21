(() => {
  let lastEditable = null;
  let lastRange = null;
  let assistantHost = null;
  let assistantShadow = null;
  let assistantOpen = false;
  let assistantTemplates = [];
  let assistantTab = 'templates';
  let assistantReplyContext = '';

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 120 &&
      rect.height > 40
    );
  }

  function closestEditable(node) {
    if (!(node instanceof Element)) return null;
    const editable = node.closest('[contenteditable="true"]');
    return editable && isComposeBody(editable) ? editable : null;
  }

  function isComposeBody(element) {
    const label = element.getAttribute('aria-label') || '';
    return element.matches('[role="textbox"][aria-multiline="true"], [data-lexical-editor="true"]') ||
      /message body|email body|mail body/i.test(label);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE
      ? container
      : container.parentElement;
    const editable = closestEditable(element);

    if (editable && isVisible(editable)) {
      lastEditable = editable;
      lastRange = range.cloneRange();
    }
  }

  function createAssistant() {
    if (assistantHost) return;
    assistantHost = document.createElement('div');
    assistantHost.id = 'mail-template-vault-assistant';
    assistantHost.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
    assistantShadow = assistantHost.attachShadow({ mode: 'open' });
    assistantShadow.innerHTML = `
      <style>
        *{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer}
        .trigger{position:fixed;width:34px;height:34px;padding:0;display:grid;place-items:center;border:1px solid #d7ddd9;border-radius:11px;color:#fff;background:#173b32;box-shadow:0 6px 20px rgba(15,35,29,.22);pointer-events:auto;font:800 13px/1 system-ui,sans-serif}
        .trigger:hover{background:#245648}.trigger:focus-visible,.panel button:focus-visible,.panel input:focus-visible{outline:2px solid #28745e;outline-offset:2px}
        .panel{position:fixed;width:min(330px,calc(100vw - 20px));max-height:min(470px,calc(100vh - 20px));overflow:auto;padding:12px;color:#17221f;background:#fff;border:1px solid #dce3dd;border-radius:14px;box-shadow:0 22px 55px rgba(15,35,29,.2);pointer-events:auto;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
        .head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.brand{font-weight:800}.close{width:28px;height:28px;border:0;border-radius:8px;color:#607069;background:#f0f3f1}
        .tabs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:4px;background:#f0f3f1;border-radius:10px}.tab{min-height:31px;padding:4px 6px;border:0;border-radius:7px;color:#66736e;background:transparent;font-size:11px;font-weight:750}.tab.active{color:#173b32;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .body{padding-top:11px}.search{width:100%;height:36px;padding:0 10px;border:1px solid #dce3dd;border-radius:9px;outline:0}.search:focus{border-color:#477c6c}.list{display:grid;gap:6px;margin-top:9px}.template{padding:9px 10px;text-align:left;border:1px solid #e1e6e2;border-radius:9px;color:#17221f;background:#fff}.template:hover{border-color:#6c9286;background:#f7faf8}.template strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.template span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:#6d7874;font-size:10px}
        .actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.action{min-height:38px;padding:7px 9px;border:1px solid #dce3dd;border-radius:9px;color:#25493e;background:#f8faf9;font-size:11px;font-weight:750}.action:hover{background:#edf5f1;border-color:#a8bdb5}.action.primary{grid-column:1/-1;color:#fff;background:#173b32;border-color:#173b32}
        .hint,.empty{margin:0 0 10px;color:#6d7874;font-size:11px}.status{padding:16px 4px;text-align:center;color:#6d7874;font-size:11px}.error{padding:9px;margin-top:9px;color:#8d2e2e;background:#fff1ef;border-radius:8px;font-size:11px}.result{margin-top:10px;padding:10px;background:#f4f7f5;border-radius:10px}.result-editor{width:100%;min-height:150px;max-height:230px;resize:vertical;padding:9px;margin:0 0 9px;color:#17221f;background:#fff;border:1px solid #cad5cf;border-radius:8px;line-height:1.45;outline:0}.result-editor:focus{border-color:#477c6c}.result-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.result-action{min-height:32px;padding:5px 7px;border:1px solid #cad5cf;border-radius:8px;color:#25493e;background:#fff;font-size:10px;font-weight:750}.result-action.primary{color:#fff;background:#173b32;border-color:#173b32}.privacy{padding:11px;background:#f4f7f5;border-radius:10px}.privacy h3{margin:0 0 6px;font-size:13px}.privacy p{margin:0 0 10px;color:#5f6f69;font-size:11px}.privacy-actions{display:flex;gap:7px}
      </style>
      <button class="trigger" type="button" title="Open Mail Template Vault" aria-label="Open Mail Template Vault" hidden>MT</button>
      <section class="panel" role="dialog" aria-label="Mail Template Vault assistant" hidden>
        <div class="head"><span class="brand">Mail Template Vault</span><button class="close" type="button" aria-label="Close">×</button></div>
        <div class="tabs" role="tablist"><button class="tab active" data-tab="templates" type="button">Templates</button><button class="tab" data-tab="reply" type="button">AI Reply</button><button class="tab" data-tab="improve" type="button">Improve</button></div>
        <div class="body"></div>
      </section>`;
    document.documentElement.appendChild(assistantHost);
    assistantShadow.querySelector('.trigger').addEventListener('click', () => setAssistantOpen(!assistantOpen));
    assistantShadow.querySelector('.close').addEventListener('click', () => setAssistantOpen(false));
    assistantShadow.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => selectAssistantTab(button.dataset.tab)));
    assistantShadow.querySelector('.body').innerHTML = '<p class="hint">Open a tab to begin.</p>';
  }

  function assistantElements() {
    return assistantShadow && {
      trigger: assistantShadow.querySelector('.trigger'),
      panel: assistantShadow.querySelector('.panel'),
      body: assistantShadow.querySelector('.body')
    };
  }

  function positionAssistant() {
    const elements = assistantElements();
    if (!elements || !lastEditable?.isConnected || !isVisible(lastEditable)) return;
    const rect = lastEditable.getBoundingClientRect();
    const buttonLeft = Math.max(8, Math.min(innerWidth - 42, rect.right - 42));
    const buttonTop = Math.max(8, Math.min(innerHeight - 42, rect.bottom - 42));
    elements.trigger.style.left = `${buttonLeft}px`;
    elements.trigger.style.top = `${buttonTop}px`;
    const panelWidth = Math.min(330, innerWidth - 20);
    const left = Math.max(10, Math.min(innerWidth - panelWidth - 10, buttonLeft + 34 - panelWidth));
    const panelHeight = Math.min(470, innerHeight - 20);
    const above = buttonTop - panelHeight - 8;
    elements.panel.style.left = `${left}px`;
    elements.panel.style.top = `${above >= 10 ? above : Math.min(innerHeight - panelHeight - 10, buttonTop + 42)}px`;
  }

  function setAssistantVisible(visible) {
    createAssistant();
    const elements = assistantElements();
    elements.trigger.hidden = !visible;
    if (!visible) setAssistantOpen(false);
    else positionAssistant();
  }

  function setAssistantOpen(open) {
    const elements = assistantElements();
    assistantOpen = Boolean(open && lastEditable?.isConnected && isVisible(lastEditable));
    elements.panel.hidden = !assistantOpen;
    if (assistantOpen) { positionAssistant(); selectAssistantTab('templates'); }
  }

  function templatePreview(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  async function loadAssistantTemplates(query = '') {
    const body = assistantElements().body;
    body.innerHTML = '<div class="status">Loading templates…</div>';
    try {
      if (!assistantTemplates.length) {
        const response = await chrome.runtime.sendMessage({ type: 'ETM_CONTEXT_TEMPLATES' });
        if (!response?.ok) throw new Error(response?.error || 'Could not load templates.');
        assistantTemplates = Array.isArray(response.result?.templates) ? response.result.templates : [];
      }
      if (assistantTab === 'templates') renderTemplateTab(query);
    } catch (error) {
      body.innerHTML = '';
      const message = document.createElement('div'); message.className = 'error'; message.textContent = error.message;
      body.appendChild(message);
    }
  }

  function renderTemplateTab(query = '') {
    const body = assistantElements().body;
    body.innerHTML = '<input class="search" type="search" placeholder="Search templates" aria-label="Search templates"><div class="list"></div>';
    const search = body.querySelector('.search');
    const list = body.querySelector('.list');
    search.value = query;
    const normalized = query.trim().toLowerCase();
    const filtered = assistantTemplates.filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || templatePreview(item.html).toLowerCase().includes(normalized));
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = normalized ? 'No matching templates.' : 'No templates yet. Create one in the side panel.'; list.appendChild(empty);
    }
    for (const template of filtered) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'template';
      const name = document.createElement('strong'); name.textContent = template.name;
      const preview = document.createElement('span'); preview.textContent = templatePreview(template.html) || 'Empty template';
      button.append(name, preview);
      button.addEventListener('click', () => {
        try { insertHtml(lastEditable, template.html); setAssistantOpen(false); }
        catch (error) { showAssistantError(error.message); }
      });
      list.appendChild(button);
    }
    search.addEventListener('input', () => renderTemplateTab(search.value));
    search.focus();
  }

  function selectAssistantTab(tab) {
    if (!assistantShadow) return;
    assistantTab = tab;
    assistantShadow.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    if (tab === 'templates') { loadAssistantTemplates(); return; }
    const body = assistantElements().body;
    const actions = tab === 'reply' ? [['reply', 'Generate Reply']] : [
      ['professional', 'Rewrite Professionally'], ['grammar', 'Fix Grammar'], ['shorten', 'Shorten'],
      ['expand', 'Expand'], ['friendly', 'Friendly'], ['formal', 'Formal']
    ];
    body.innerHTML = `<p class="hint">${tab === 'reply' ? 'Create a reply from the text currently in the compose editor.' : 'Select text in the message, or use the full draft.'}</p><div class="actions"></div><div class="output"></div>`;
    const container = body.querySelector('.actions');
    for (const [action, label] of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `action${action === 'reply' ? ' primary' : ''}`; button.textContent = label;
      button.addEventListener('click', () => runAiAction(action, label)); container.appendChild(button);
    }
  }

  function selectedComposeText() {
    const selection = getSelection();
    if (selection && selection.rangeCount && lastEditable) {
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      const selected = lastEditable.contains(node) ? selection.toString().trim() : '';
      if (selected) return selected;
    }
    return (lastEditable?.innerText || lastEditable?.textContent || '').trim();
  }

  const THREAD_MESSAGE_SELECTORS = [
    '[data-testid*="message-body" i]', '[data-testid*="messagebody" i]',
    '[data-app-section="MailReadCompose"] [role="document"]',
    '[data-app-section="MailReadCompose"] .allowTextSelection',
    '[role="document"]'
  ].join(',');
  const THREAD_DROP_TAGS = new Set(['script', 'style', 'noscript', 'img', 'svg', 'canvas', 'form', 'button', 'input', 'textarea', 'select']);
  const THREAD_BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'li', 'ul', 'ol', 'table', 'tr', 'br', 'hr']);

  function isThreadElementVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    for (let node = element; node && node instanceof HTMLElement; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
    }
    return element.getClientRects().length > 0;
  }

  function isUiChrome(element) {
    const role = element.getAttribute('role') || '';
    const marker = `${element.id} ${element.className || ''} ${element.getAttribute('data-testid') || ''}`;
    return /^(button|menu|menubar|navigation|toolbar|tablist|dialog)$/i.test(role) ||
      /(?:^|[\s_-])(toolbar|commandbar|actions?|controls?|ribbon|reaction|attachment)(?:[\s_-]|$)/i.test(marker);
  }

  function cleanThreadText(root) {
    const parts = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { parts.push(node.nodeValue || ''); return; }
      if (!(node instanceof HTMLElement)) return;
      const tag = node.tagName.toLowerCase();
      if (THREAD_DROP_TAGS.has(tag) || !isThreadElementVisible(node) || isUiChrome(node)) return;
      const block = THREAD_BLOCK_TAGS.has(tag);
      if (block) parts.push('\n');
      for (const child of node.childNodes) walk(child);
      if (block) parts.push('\n');
    }
    walk(root);
    return parts.join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .filter((line) => !/^(?:from|sent|to|cc|bcc|subject):\s*.+$/i.test(line.trim()))
      .join('\n')
      .replace(/(?:^|\n)-{2,}\s*original message\s*-{2,}[\s\S]*$/i, '')
      .trim();
  }

  function threadMessageCandidates(root) {
    const seen = new Set();
    return [...root.querySelectorAll(THREAD_MESSAGE_SELECTORS)].filter((element) => {
      if (seen.has(element) || element === lastEditable || element.contains(lastEditable) || lastEditable?.contains(element) ||
          element.isContentEditable || !isThreadElementVisible(element)) return false;
      const nestedBody = [...element.querySelectorAll(THREAD_MESSAGE_SELECTORS)]
        .some((child) => child !== lastEditable && !child.contains(lastEditable) && isThreadElementVisible(child));
      if (nestedBody) return false;
      seen.add(element);
      return cleanThreadText(element).length > 0;
    });
  }

  function findConversationRoot() {
    let node = lastEditable?.parentElement;
    for (let depth = 0; node && depth < 10 && node !== document.body && node !== document.documentElement; depth += 1, node = node.parentElement) {
      if (threadMessageCandidates(node).length) return node;
    }
    return null;
  }

  function visibleSenderName(message, conversationRoot) {
    let container = message;
    for (let depth = 0; container && container !== conversationRoot && depth < 5; depth += 1, container = container.parentElement) {
      const sender = container.querySelector('[data-sender-name], [data-testid*="sender" i], [aria-label^="From:" i]');
      if (!sender || !isThreadElementVisible(sender)) continue;
      const value = sender.getAttribute('data-sender-name') || sender.getAttribute('aria-label')?.replace(/^From:\s*/i, '') || sender.textContent;
      if (value?.trim() && value.trim().length <= 160) return value.trim();
    }
    return '';
  }

  function visibleSubject(conversationRoot) {
    const selectors = '[data-testid*="subject" i], [aria-label^="Subject:" i], [role="heading"], h1, h2';
    for (const element of conversationRoot.querySelectorAll(selectors)) {
      if (!isThreadElementVisible(element) || element.contains(lastEditable)) continue;
      const value = (element.getAttribute('aria-label')?.replace(/^Subject:\s*/i, '') || element.textContent || '').replace(/\s+/g, ' ').trim();
      if (value && value.length <= 300 && !/^(inbox|focused|other|message|conversation)$/i.test(value)) return value;
    }
    return '';
  }

  function truncateThreadPart(value, limit) {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit).trimEnd()}\n[truncated]`;
  }

  function extractVisibleThreadContext() {
    const conversationRoot = findConversationRoot();
    if (!conversationRoot) throw new Error('No visible Outlook conversation was found around this reply editor.');
    const candidates = threadMessageCandidates(conversationRoot).slice(-4);
    if (!candidates.length) throw new Error('No visible incoming message was found in this conversation.');
    const latest = candidates[candidates.length - 1];
    const previous = candidates.slice(0, -1).reverse().slice(0, 3);
    const sections = [];
    const subject = visibleSubject(conversationRoot);
    if (subject) sections.push(`Subject: ${subject}`);
    const latestSender = visibleSenderName(latest, conversationRoot);
    sections.push(`Latest incoming message${latestSender ? `\nFrom: ${latestSender}` : ''}\n${truncateThreadPart(cleanThreadText(latest), 5000)}`);
    if (previous.length) {
      sections.push(`Recent visible previous messages\n${previous.map((message, index) => {
        const sender = visibleSenderName(message, conversationRoot);
        return `[${index + 1}]${sender ? ` From: ${sender}` : ''}\n${truncateThreadPart(cleanThreadText(message), 2200)}`;
      }).join('\n\n')}`);
    }
    const draft = (lastEditable?.innerText || lastEditable?.textContent || '').trim();
    if (draft) sections.push(`Current draft\n${truncateThreadPart(draft, 1800)}`);
    return truncateThreadPart(sections.join('\n\n'), 12000);
  }

  async function confirmAiPrivacy(output) {
    const status = await chrome.runtime.sendMessage({ type: 'ETM_AI_PRIVACY_STATUS' });
    if (!status?.ok) throw new Error(status?.error || 'Could not check the AI privacy setting.');
    if (status.result?.accepted) return true;
    output.innerHTML = '';
    const notice = document.createElement('div'); notice.className = 'privacy';
    const heading = document.createElement('h3'); heading.textContent = 'Share visible email context?';
    const copy = document.createElement('p');
    copy.textContent = 'Mail Template Vault will send the cleaned, visible conversation and current draft to the AI service to generate this result. It will not inspect your inbox, send mail, or store the email thread.';
    const actions = document.createElement('div'); actions.className = 'privacy-actions';
    const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.className = 'result-action primary'; continueButton.textContent = 'Continue';
    const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.className = 'result-action'; cancelButton.textContent = 'Cancel';
    actions.append(continueButton, cancelButton); notice.append(heading, copy, actions); output.appendChild(notice);
    return new Promise((resolve, reject) => {
      continueButton.addEventListener('click', async () => {
        continueButton.disabled = cancelButton.disabled = true;
        try {
          const accepted = await chrome.runtime.sendMessage({ type: 'ETM_AI_PRIVACY_ACCEPT' });
          if (!accepted?.ok) throw new Error(accepted?.error || 'Could not save the privacy confirmation.');
          resolve(true);
        } catch (error) { reject(error); }
      });
      cancelButton.addEventListener('click', () => { output.innerHTML = '<div class="status">AI request canceled.</div>'; resolve(false); });
    });
  }

  async function requestAi(action, text) {
    const response = await chrome.runtime.sendMessage({ type: 'ETM_AI_ASSIST', action, text });
    if (!response?.ok) throw new Error(response?.error || 'AI assistance failed.');
    return response.result.text;
  }

  function resultButton(label, className = '') {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `result-action${className ? ` ${className}` : ''}`; button.textContent = label;
    return button;
  }

  function renderEditableResult(output, text, isReply) {
    output.innerHTML = '';
    const result = document.createElement('div'); result.className = 'result';
    const editor = document.createElement('textarea'); editor.className = 'result-editor'; editor.value = text; editor.setAttribute('aria-label', 'Generated email preview');
    const actions = document.createElement('div'); actions.className = 'result-actions';
    const insert = resultButton('Insert', 'primary');
    const cancel = resultButton('Cancel');
    insert.addEventListener('click', () => {
      const value = editor.value.trim();
      if (!value) { showAssistantError('The generated preview is empty.', output); return; }
      insertHtml(lastEditable, TemplateSanitizer.textToHtml(value));
      assistantReplyContext = '';
      setAssistantOpen(false);
    });
    cancel.addEventListener('click', () => { assistantReplyContext = ''; setAssistantOpen(false); });
    actions.append(insert);
    if (isReply) {
      const regenerate = resultButton('Regenerate');
      const shorter = resultButton('Shorter');
      const formal = resultButton('More Formal');
      regenerate.addEventListener('click', () => refineReply(output, 'reply', assistantReplyContext));
      shorter.addEventListener('click', () => refineReply(output, 'shorten', editor.value));
      formal.addEventListener('click', () => refineReply(output, 'formal', editor.value));
      actions.append(regenerate, shorter, formal);
    }
    actions.append(cancel);
    result.append(editor, actions); output.appendChild(result); editor.focus(); editor.select();
  }

  async function refineReply(output, action, text) {
    if (!text?.trim()) { showAssistantError('The preview is empty.', output); return; }
    output.innerHTML = `<div class="status">${action === 'reply' ? 'Regenerating reply…' : 'Refining reply…'}</div>`;
    try { renderEditableResult(output, await requestAi(action, text.trim()), true); }
    catch (error) { showAssistantError(error.message, output); }
  }

  async function runAiAction(action) {
    const body = assistantElements().body;
    const output = body.querySelector('.output');
    output.innerHTML = '<div class="status">Preparing secure AI request…</div>';
    body.querySelectorAll('.action').forEach((button) => { button.disabled = true; });
    try {
      // Privacy boundary: conversation extraction occurs only for this explicit
      // Generate Reply action, never when the editor or assistant is opened.
      const text = action === 'reply' ? extractVisibleThreadContext() : selectedComposeText();
      if (!text) throw new Error('Add or select some message text first.');
      if (action === 'reply') assistantReplyContext = text;
      if (!await confirmAiPrivacy(output)) return;
      output.innerHTML = '<div class="status">Generating…</div>';
      renderEditableResult(output, await requestAi(action, text), action === 'reply');
    } catch (error) { showAssistantError(error.message, output); }
    finally { body.querySelectorAll('.action').forEach((button) => { button.disabled = false; }); }
  }

  function showAssistantError(text, target = assistantElements().body) {
    const error = document.createElement('div'); error.className = 'error'; error.textContent = text || 'Something went wrong.';
    target.innerHTML = ''; target.appendChild(error);
  }

  document.addEventListener('focusin', (event) => {
    const editable = closestEditable(event.target);
    if (editable && isVisible(editable)) {
      lastEditable = editable;
      rememberSelection();
      setAssistantVisible(true);
    } else if (event.target !== assistantHost) {
      setAssistantVisible(false);
    }
  }, true);

  document.addEventListener('selectionchange', rememberSelection, true);
  document.addEventListener('keyup', rememberSelection, true);
  document.addEventListener('mouseup', rememberSelection, true);
  window.addEventListener('resize', positionAssistant);
  document.addEventListener('scroll', positionAssistant, true);

  const activeAtLoad = closestEditable(document.activeElement);
  if (activeAtLoad && isVisible(activeAtLoad)) {
    lastEditable = activeAtLoad;
    rememberSelection();
    setAssistantVisible(true);
  }

  function findBestEditable() {
    if (lastEditable && lastEditable.isConnected && isVisible(lastEditable) && isComposeBody(lastEditable)) {
      return lastEditable;
    }

    const candidates = [...document.querySelectorAll('[contenteditable="true"]')]
      .filter((element) => isVisible(element) && isComposeBody(element));

    return candidates.length === 1 ? candidates[0] : null;
  }

  function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
  }

  function restoreCaret(element) {
    const selection = window.getSelection();
    if (
      lastRange &&
      lastRange.commonAncestorContainer &&
      document.contains(lastRange.commonAncestorContainer) &&
      element.contains(
        lastRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? lastRange.commonAncestorContainer
          : lastRange.commonAncestorContainer.parentElement
      )
    ) {
      selection.removeAllRanges();
      selection.addRange(lastRange);
      return;
    }
    placeCaretAtEnd(element);
  }

  function insertHtml(element, html) {
    const cleanHtml = TemplateSanitizer.toEmailHtml(html);
    if (!cleanHtml) throw new Error('This template has no insertable email content.');

    const rememberedRange = lastRange;
    element.focus();
    lastRange = rememberedRange;
    restoreCaret(element);

    let inserted = false;
    try {
      inserted = document.execCommand('insertHTML', false, cleanHtml);
    } catch (_) {
      inserted = false;
    }

    if (!inserted) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        placeCaretAtEnd(element);
      }
      const activeSelection = window.getSelection();
      const range = activeSelection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(cleanHtml);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        activeSelection.removeAllRanges();
        activeSelection.addRange(range);
      }
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertFromPaste',
      data: null
    }));

    rememberSelection();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'ETM_INSERT_TEMPLATE') return;
    if (sender.id !== chrome.runtime.id) return;

    const editable = findBestEditable();
    if (!editable) {
      sendResponse({
        ok: false,
        error: 'Select the target email: open a new/reply message and click inside its body, then try again.'
      });
      return;
    }

    try {
      insertHtml(editable, message.html || '');
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || 'Could not insert the template.' });
    }
  });
})();
