(() => {
  let lastEditable = null;
  let lastRange = null;
  let assistantHost = null;
  let assistantShadow = null;
  let assistantOpen = false;
  let assistantTemplates = [];

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
        .body{padding-top:11px}.search{width:100%;height:36px;padding:0 10px;border:1px solid #dce3dd;border-radius:9px;outline:0}.search:focus{border-color:#477c6c}.list{display:grid;gap:6px;margin-top:9px}.template{padding:9px 10px;text-align:left;border:1px solid #e1e6e2;border-radius:9px;color:#17221f;background:#fff}.template:hover{border-color:#6c9286;background:#f7faf8}.template strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.template span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:#6d7874;font-size:10px}
        .empty{margin:0 0 10px;color:#6d7874;font-size:11px}.status{padding:16px 4px;text-align:center;color:#6d7874;font-size:11px}.error{padding:9px;margin-top:9px;color:#8d2e2e;background:#fff1ef;border-radius:8px;font-size:11px}
      </style>
      <button class="trigger" type="button" title="Open Mail Template Vault" aria-label="Open Mail Template Vault" hidden>MT</button>
      <section class="panel" role="dialog" aria-label="Mail Template Vault assistant" hidden>
        <div class="head"><span class="brand">Mail Template Vault</span><button class="close" type="button" aria-label="Close">×</button></div>
        <div class="body"></div>
      </section>`;
    document.documentElement.appendChild(assistantHost);
    assistantShadow.querySelector('.trigger').addEventListener('click', () => setAssistantOpen(!assistantOpen));
    assistantShadow.querySelector('.close').addEventListener('click', () => setAssistantOpen(false));
    assistantShadow.querySelector('.body').innerHTML = '<div class="status">Loading templates…</div>';
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
    if (assistantOpen) { positionAssistant(); loadAssistantTemplates(); }
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
      renderTemplateTab(query);
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
