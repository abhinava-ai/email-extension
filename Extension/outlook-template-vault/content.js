(() => {
  if (globalThis.__MAIL_TEMPLATE_VAULT_CONTENT_INITIALIZED__) return;
  globalThis.__MAIL_TEMPLATE_VAULT_CONTENT_INITIALIZED__ = true;
  const WINDOW_HOST_ID = 'mail-template-vault-window';
  const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>';
  let lastEditable = null;
  let lastRange = null;
  let assistantHost = null;
  let assistantShadow = null;
  let assistantOpen = false;
  let assistantTemplates = [];
  let templatesLoaded = false;
  let activeIndex = 0;
  let visibleTemplates = [];
  let watchTimer = null;
  let pillTimer = null;
  let inserting = false;
  let lastInserted = null;
  const TEXT_STYLE_PROPERTIES = ['font-family', 'font-size', 'color', 'background-color', 'font-weight', 'font-style', 'text-decoration-line', 'vertical-align'];
  const INLINE_TEXT_TAGS = new Set(['span', 'a', 'strong', 'em', 'u', 's', 'sub', 'sup', 'code']);
  let preferences = { interfaceMode: 'popover', inlineButton: true };

  function friendlyError(error) {
    const message = error?.message || 'Could not load templates.';
    return /context invalidated|receiving end/i.test(message)
      ? 'The extension was updated. Refresh this Outlook tab to continue.'
      : message;
  }

  function triggerEnabled() {
    return preferences.inlineButton !== false || preferences.interfaceMode === 'inline';
  }

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
    // A previous version of this script can be left behind after an extension update.
    document.getElementById('mail-template-vault-assistant')?.remove();
    assistantHost = document.createElement('div');
    assistantHost.id = 'mail-template-vault-assistant';
    assistantHost.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
    assistantShadow = assistantHost.attachShadow({ mode: 'open' });
    assistantShadow.innerHTML = `
      <style>
        *{box-sizing:border-box}[hidden]{display:none!important}button,input{font:inherit}button{cursor:pointer}
        .panel,.pill{font:13px/1.45 Inter,-apple-system,"Segoe UI",system-ui,sans-serif}.panel{color:#17181c}
        .trigger{position:fixed;width:36px;height:36px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;color:#fff;background:#17181c;box-shadow:0 8px 20px rgba(10,18,32,.28);pointer-events:auto;transition:transform .15s ease,background .15s ease;animation:rise .16s ease}
        .trigger svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .trigger:hover{background:#2f80ed;transform:scale(1.06)}
        .trigger:focus-visible,.panel button:focus-visible{outline:2px solid #2f80ed;outline-offset:2px}
        .panel{position:fixed;width:min(350px,calc(100vw - 20px));max-height:min(480px,calc(100vh - 20px));display:flex;flex-direction:column;padding:14px;color:#17181c;background:#f7f8fa;border:1px solid rgba(17,24,39,.08);border-radius:20px;box-shadow:0 24px 64px rgba(10,18,32,.24),0 2px 8px rgba(10,18,32,.08);pointer-events:auto;animation:rise .16s cubic-bezier(.2,.8,.2,1)}
        @keyframes rise{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
        .head{display:flex;align-items:center;gap:8px;margin-bottom:10px}.brand{flex:1;min-width:0;font-size:14px;font-weight:650}.count{display:block;margin-top:1px;color:#737b88;font-size:11px;font-weight:450}
        .close{width:28px;height:28px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;color:#5b6472;background:#fff;box-shadow:0 0 0 1px #e9ebef;font-size:16px;line-height:1;transition:background .15s}.close:hover{background:#eceef1}
        .body{min-height:0;display:flex;flex-direction:column}
        .search-wrap{flex:none;position:relative}.search-wrap svg{position:absolute;left:12px;top:11px;width:16px;height:16px;fill:none;stroke:#17181c;stroke-width:2;stroke-linecap:round}
        .search{width:100%;height:38px;padding:0 12px 0 36px;color:#17181c;background:#fff;border:1px solid #e9ebef;border-radius:12px;outline:0;transition:border-color .15s,box-shadow .15s}.search::placeholder{color:#8a919c}.search:focus{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.14)}
        .list{min-height:0;overflow:auto;overscroll-behavior:contain;display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:8px;margin-top:10px;padding:1px}
        .template{width:100%;padding:11px 12px;text-align:left;color:#17181c;background:#fff;border:1px solid #e9ebef;border-radius:14px;transition:border-color .15s,box-shadow .15s}.template:hover,.template.active{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}
        .template strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:620}.template span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:3px;color:#5b6472;font-size:11.5px}
        .empty,.status{margin:0;padding:18px 6px;text-align:center;color:#737b88;font-size:12px}.error{padding:10px 12px;color:#a32c2c;background:#fdeeee;border-radius:12px;font-size:12px}
        .sign-in{height:38px;padding:0 14px;color:#fff;background:#17181c;border:0;border-radius:12px;font-weight:600;transition:background .15s}.sign-in:hover{background:#000}
        .pill{position:fixed;left:50%;bottom:26px;max-width:min(420px,calc(100vw - 32px));padding:11px 18px;color:#fff;background:#17181c;border-radius:999px;box-shadow:0 12px 28px rgba(10,18,32,.32);font-size:13px;transform:translateX(-50%);pointer-events:none}
        @media(prefers-reduced-motion:reduce){.trigger,.panel,.template,.search{transition:none;animation:none}}
      </style>
      <button class="trigger" type="button" title="Insert a template" aria-label="Open Mail Template Vault" hidden>${ENVELOPE}</button>
      <section class="panel" role="dialog" aria-label="Mail Template Vault assistant" hidden>
        <div class="head"><span class="brand">Templates<span class="count"></span></span><button class="close" type="button" aria-label="Close">&times;</button></div>
        <div class="body">
          <div class="search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input class="search" type="search" placeholder="Search Template" aria-label="Search templates" autocomplete="off"></div>
          <div class="list" role="listbox" aria-label="Templates"></div>
        </div>
      </section>
      <div class="pill" role="status" hidden></div>`;
    document.documentElement.appendChild(assistantHost);
    const { trigger, panel, search, list } = assistantElements();
    // Keeps the caret in the email body instead of moving focus to the button.
    trigger.addEventListener('mousedown', (event) => event.preventDefault());
    trigger.addEventListener('click', () => setAssistantOpen(!assistantOpen));
    assistantShadow.querySelector('.close').addEventListener('click', () => setAssistantOpen(false));
    search.addEventListener('input', () => { activeIndex = 0; renderTemplateList(); });
    panel.addEventListener('keydown', onPanelKeydown);
    // Outlook has single-key shortcuts (N, R, Delete). Typing in the picker must not reach them.
    for (const type of ['keydown', 'keypress', 'keyup']) {
      panel.addEventListener(type, (event) => event.stopPropagation());
    }
    list.addEventListener('mousemove', (event) => {
      const row = event.target.closest('.template');
      if (row) setActive(Number(row.dataset.index));
    });
  }

  function assistantElements() {
    return assistantShadow && {
      trigger: assistantShadow.querySelector('.trigger'),
      panel: assistantShadow.querySelector('.panel'),
      search: assistantShadow.querySelector('.search'),
      list: assistantShadow.querySelector('.list'),
      count: assistantShadow.querySelector('.count'),
      pill: assistantShadow.querySelector('.pill')
    };
  }

  function showPill(text) {
    createAssistant();
    const { pill } = assistantElements();
    pill.textContent = text;
    pill.hidden = false;
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => { pill.hidden = true; }, 3200);
  }

  // The part of an element that can be seen, after clipping by its scrolling parents.
  function visibleRect(element) {
    const rect = element.getBoundingClientRect();
    let { left, top, right, bottom } = rect;
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(node);
      if (overflowX === 'visible' && overflowY === 'visible') continue;
      const clip = node.getBoundingClientRect();
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    return { left, top, right: Math.min(right, innerWidth), bottom: Math.min(bottom, innerHeight) };
  }

  function positionAssistant() {
    const elements = assistantElements();
    if (!elements || !lastEditable?.isConnected || !isVisible(lastEditable)) return;
    const rect = visibleRect(lastEditable);
    const buttonLeft = Math.max(8, Math.min(innerWidth - 44, rect.right - 46));
    const buttonTop = Math.max(8, Math.min(innerHeight - 44, rect.bottom - 46));
    elements.trigger.style.left = `${buttonLeft}px`;
    elements.trigger.style.top = `${buttonTop}px`;
    const panelWidth = Math.min(350, innerWidth - 20);
    const left = Math.max(10, Math.min(innerWidth - panelWidth - 10, buttonLeft + 36 - panelWidth));
    const panelHeight = Math.min(480, innerHeight - 20);
    const above = buttonTop - panelHeight - 8;
    elements.panel.style.left = `${left}px`;
    elements.panel.style.top = `${above >= 10 ? above : Math.max(10, Math.min(innerHeight - panelHeight - 10, buttonTop + 44))}px`;
  }

  // Outlook can close or move a compose window without any focus or scroll event.
  function watchCompose(watching) {
    clearInterval(watchTimer);
    watchTimer = null;
    if (!watching) return;
    watchTimer = setInterval(() => {
      if (!lastEditable?.isConnected || !isVisible(lastEditable)) setAssistantVisible(false);
      else positionAssistant();
    }, 700);
  }

  function setAssistantVisible(visible) {
    createAssistant();
    const elements = assistantElements();
    const show = visible && triggerEnabled();
    elements.trigger.hidden = !show;
    watchCompose(show);
    if (!show) setAssistantOpen(false);
    else positionAssistant();
  }

  function setAssistantOpen(open) {
    const elements = assistantElements();
    assistantOpen = Boolean(open && lastEditable?.isConnected && isVisible(lastEditable));
    elements.panel.hidden = !assistantOpen;
    if (!assistantOpen) return;
    positionAssistant();
    elements.search.value = '';
    activeIndex = 0;
    elements.search.focus();
    loadAssistantTemplates();
  }

  function templatePreview(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  async function loadAssistantTemplates() {
    const { list, count } = assistantElements();
    // Saved results show straight away and refresh underneath.
    if (templatesLoaded) renderTemplateList();
    else list.innerHTML = '<div class="status">Loading templates…</div>';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ETM_CONTEXT_TEMPLATES' });
      if (!response?.ok) throw new Error(response?.error || 'Could not load templates.');
      assistantTemplates = Array.isArray(response.result?.templates) ? response.result.templates : [];
      templatesLoaded = true;
      renderTemplateList();
    } catch (error) {
      const message = friendlyError(error);
      // Saved templates are only kept through a passing network problem, never once signed out.
      if (templatesLoaded && !/sign in|password/i.test(message)) return;
      templatesLoaded = false;
      assistantTemplates = [];
      count.textContent = '';
      showAssistantError(message);
    }
  }

  function setActive(index) {
    const rows = [...assistantElements().list.querySelectorAll('.template')];
    if (!rows.length) return;
    activeIndex = (index + rows.length) % rows.length;
    rows.forEach((row, position) => {
      const active = position === activeIndex;
      row.classList.toggle('active', active);
      row.setAttribute('aria-selected', String(active));
    });
    rows[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderTemplateList() {
    const { search, list, count } = assistantElements();
    const normalized = search.value.trim().toLowerCase();
    visibleTemplates = assistantTemplates
      .filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || templatePreview(item.html).toLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name));
    count.textContent = normalized
      ? `${visibleTemplates.length} of ${assistantTemplates.length} Templates`
      : `${assistantTemplates.length} Templates`;
    list.innerHTML = '';
    if (!visibleTemplates.length) {
      const empty = document.createElement('p'); empty.className = 'empty';
      empty.textContent = normalized ? 'No matching templates.' : 'No templates yet. Add one from the web dashboard.';
      list.appendChild(empty);
      return;
    }
    visibleTemplates.forEach((template, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'template'; button.dataset.index = String(index);
      button.setAttribute('role', 'option');
      const name = document.createElement('strong'); name.textContent = template.name;
      const preview = document.createElement('span'); preview.textContent = templatePreview(template.html) || 'Empty template';
      button.append(name, preview);
      button.addEventListener('click', () => insertFromPicker(template));
      list.appendChild(button);
    });
    setActive(Math.min(activeIndex, visibleTemplates.length - 1));
  }

  async function insertFromPicker(template) {
    if (inserting) return;
    inserting = true;
    try {
      setAssistantOpen(false);
      await insertHtml(lastEditable, template.html);
      showPill(`Inserted: ${template.name}`);
    } catch (error) {
      showPill(friendlyError(error));
    } finally {
      inserting = false;
    }
  }

  function onPanelKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setAssistantOpen(false);
      lastEditable?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && event.target === assistantElements().search) {
      event.preventDefault();
      if (visibleTemplates[activeIndex]) insertFromPicker(visibleTemplates[activeIndex]);
    }
  }

  function showAssistantError(text) {
    const { list } = assistantElements();
    const error = document.createElement('div'); error.className = 'error'; error.textContent = text || 'Something went wrong.';
    list.innerHTML = ''; list.appendChild(error);
    if (/sign in/i.test(text || '')) {
      const signIn = document.createElement('button');
      signIn.type = 'button'; signIn.className = 'sign-in'; signIn.textContent = 'Sign in';
      signIn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'ETM_OPEN_SIGN_IN' }).catch(() => {});
        setAssistantOpen(false);
      });
      list.appendChild(signIn);
    }
  }

  function toggleInlinePicker() {
    const editable = findBestEditable();
    if (!editable) {
      showPill('Click inside an email body first, then try again.');
      return;
    }
    lastEditable = editable;
    setAssistantVisible(true);
    setAssistantOpen(!assistantOpen);
  }

  function isOwnHost(target) {
    return target === assistantHost || target?.id === WINDOW_HOST_ID;
  }

  document.addEventListener('focusin', (event) => {
    const editable = closestEditable(event.target);
    if (editable && isVisible(editable)) {
      lastEditable = editable;
      rememberSelection();
      setAssistantVisible(true);
    } else if (!isOwnHost(event.target)) {
      setAssistantVisible(false);
    }
  }, true);

  // Clicking elsewhere closes the picker but leaves the button in place.
  document.addEventListener('pointerdown', (event) => {
    if (assistantOpen && !event.composedPath().includes(assistantHost)) setAssistantOpen(false);
  }, true);

  // Outlook can move focus or replace the email body without a focus event reaching this script.
  setInterval(() => {
    if (assistantElements() && !assistantElements().trigger.hidden) return;
    const active = closestEditable(document.activeElement);
    if (active && isVisible(active)) {
      lastEditable = active;
      rememberSelection();
      setAssistantVisible(true);
    }
  }, 800);

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

  // The source text's own styling, as one entry per visible character.
  function templateCharacters(html) {
    const doc = TemplateSanitizer.parseHtml(html);
    const characters = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const style = {};
      for (let parent = node.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
        const tag = parent.tagName.toLowerCase();
        for (const property of TEXT_STYLE_PROPERTIES) {
          if (style[property]) continue;
          // A block's background belongs to the block, which Outlook keeps by itself.
          if (property === 'background-color' && !INLINE_TEXT_TAGS.has(tag)) continue;
          const value = parent.style.getPropertyValue(property);
          if (value) style[property] = value;
        }
        if ((tag === 'sub' || tag === 'sup') && !style['vertical-align']) {
          style['vertical-align'] = tag === 'sub' ? 'sub' : 'super';
          style['font-size'] = style['font-size'] || 'smaller';
        }
        if (tag === 's' && !style['text-decoration-line']) style['text-decoration-line'] = 'line-through';
      }
      for (const character of node.nodeValue) {
        if (!/\s/.test(character)) characters.push({ character, style });
      }
    }
    return characters;
  }

  function editorCharacters(element) {
    const characters = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue;
      for (let offset = 0; offset < text.length; offset += 1) {
        if (!/\s/.test(text[offset])) characters.push({ character: text[offset], node, offset });
      }
    }
    return characters;
  }

  // Finds the inserted text, preferring the copy closest before the cursor.
  function findInserted(target, source) {
    const haystack = target.map((item) => item.character).join('');
    const needle = source.map((item) => item.character).join('');
    if (!needle) return -1;
    const selection = window.getSelection();
    let limit = haystack.length;
    if (selection?.focusNode) {
      const caret = target.findIndex((item) => item.node === selection.focusNode && item.offset >= selection.focusOffset);
      if (caret > 0) limit = caret;
    }
    const near = haystack.lastIndexOf(needle, limit - needle.length);
    return near >= 0 ? near : haystack.lastIndexOf(needle);
  }

  // Only the properties that actually differ, so plain Outlook-default text stays untouched.
  function wrapRun(node, start, end, style) {
    const probe = document.createElement('span');
    for (const [property, value] of Object.entries(style)) probe.style.setProperty(property, value);
    node.parentNode.insertBefore(probe, node);
    const parentStyle = getComputedStyle(probe.parentElement);
    const probeStyle = getComputedStyle(probe);
    for (const property of Object.keys(style)) {
      if (probeStyle.getPropertyValue(property) === parentStyle.getPropertyValue(property)) probe.style.removeProperty(property);
    }
    if (!probe.style.length) {
      probe.remove();
      return;
    }
    const tail = node.splitText(end);
    const middle = start > 0 ? node.splitText(start) : node;
    probe.remove();
    tail.parentNode.insertBefore(probe, tail);
    probe.appendChild(middle);
  }

  // Outlook's paste keeps structure and spacing but resets each run's font, size, colour and
  // highlight. Setting them through the style API puts back what the editor showed.
  function restoreTextStyles(element, source) {
    const target = editorCharacters(element);
    const start = findInserted(target, source);
    if (start < 0) return false;
    const runs = [];
    for (let index = 0; index < source.length; index += 1) {
      const { node, offset } = target[start + index];
      const last = runs[runs.length - 1];
      if (last && last.node === node && last.style === source[index].style) last.end = offset + 1;
      else runs.push({ node, start: offset, end: offset + 1, style: source[index].style });
    }
    // Back to front, so splitting one run cannot move the ones still to do.
    for (const run of runs.reverse()) wrapRun(run.node, run.start, run.end, run.style);
    return true;
  }

  // Outlook's redo brings back its own flattened copy. This only watches for the key, then
  // repairs the result. The key itself goes on to Outlook untouched.
  document.addEventListener('keyup', (event) => {
    if (!lastInserted?.element.isConnected || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'y' && !(key === 'z' && event.shiftKey)) return;
    setTimeout(() => {
      if (lastInserted?.element.isConnected) restoreTextStyles(lastInserted.element, lastInserted.source);
    }, 250);
  }, true);

  // Outlook strips every inline style from execCommand('insertHTML') and leaves it out of
  // its undo history. Its paste handler records a normal undo step, so Ctrl+Z and Ctrl+Y
  // behave exactly as they do for anything pasted by hand.
  function pasteIntoEditor(element, html) {
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', html);
    clipboard.setData('text/plain', templatePreview(html));
    const event = new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true, composed: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function insertWithBrowserCommand(html) {
    let inserted = false;
    try {
      inserted = document.execCommand('insertHTML', false, html);
    } catch (_) {
      inserted = false;
    }
    if (!inserted) throw new Error('Outlook could not create a native undo step. Click inside the message body and try again.');
  }

  async function insertHtml(element, html) {
    const cleanHtml = TemplateSanitizer.toEmailHtml(html);
    if (!cleanHtml) throw new Error('This template has no insertable email content.');

    const rememberedRange = lastRange;
    element.focus();
    lastRange = rememberedRange;
    restoreCaret(element);

    const before = element.innerHTML;
    if (pasteIntoEditor(element, cleanHtml)) {
      // Outlook finishes its paste a moment later. Never report success if nothing arrived.
      for (let waited = 0; element.innerHTML === before && waited < 1500; waited += 50) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (element.innerHTML === before) throw new Error('Outlook did not accept the template. Click inside the message body and try again.');
      await new Promise((resolve) => setTimeout(resolve, 120));
      const source = templateCharacters(cleanHtml);
      restoreTextStyles(element, source);
      lastInserted = { element, source };
    } else {
      insertWithBrowserCommand(cleanHtml);
    }

    rememberSelection();
  }

  function applyPreferences(next) {
    if (!next) return;
    preferences = next;
    if (!assistantHost) return;
    const composeActive = closestEditable(document.activeElement) || (assistantOpen && lastEditable);
    setAssistantVisible(Boolean(composeActive));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'ETM_PREFERENCES_CHANGED') {
      applyPreferences(message.preferences);
      return;
    }
    if (message?.type === 'ETM_AUTH_CHANGED') {
      templatesLoaded = false;
      assistantTemplates = [];
      if (assistantOpen) loadAssistantTemplates();
      return;
    }
    if (message?.type === 'ETM_TOGGLE_INLINE') {
      toggleInlinePicker();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type !== 'ETM_INSERT_TEMPLATE') return;

    const editable = findBestEditable();
    if (!editable) {
      sendResponse({
        ok: false,
        error: 'Select the target email: open a new/reply message and click inside its body, then try again.'
      });
      return;
    }

    insertHtml(editable, message.html || '').then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error?.message || 'Could not insert the template.' })
    );
    return true;
  });

  Promise.resolve()
    .then(() => chrome.runtime.sendMessage({ type: 'ETM_PREFERENCES_GET' }))
    .then((response) => { if (response?.ok) applyPreferences(response.result); })
    .catch(() => {});
})();
