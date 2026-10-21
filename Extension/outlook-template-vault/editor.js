(() => {
  const CHANNEL = 'MAIL_TEMPLATE_VAULT_EDITOR';
  const state = {
    templateId: null, revision: null, createdAt: null, storageReady: false,
    editorReady: false, fallbackActive: false, initialized: false,
    editorHtml: '', dirty: false, editVersion: 0, saving: false, allowClose: false,
    session: '', pending: new Map(), loadTimer: null, toastTimer: null
  };
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  function closeEditor() {
    state.allowClose = true;
    if (embedded) parent.postMessage({ type: 'MTV_EDITOR_CLOSE' }, location.origin);
    else window.close();
  }
  const el = Object.fromEntries([
    'templateForm', 'templateName', 'templateBody', 'editorFrame', 'editorCard',
    'editorLoader', 'loaderBusy', 'loaderError', 'retryEditorBtn', 'useFallbackBtn',
    'editorMode', 'editorTitle', 'saveState', 'closeBtn', 'saveBtn', 'saveCloseBtn',
    'formError', 'toast'
  ].map((id) => [id, document.getElementById(id)]));

  function showToast(message, isError = false) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3500);
  }

  function setSaveState(text, mode = '') {
    el.saveState.textContent = text;
    el.saveState.classList.remove('saved', 'warning');
    if (mode) el.saveState.classList.add(mode);
  }

  function updateActions() {
    const ready = state.storageReady && state.initialized && (state.editorReady || state.fallbackActive);
    el.saveBtn.disabled = el.saveCloseBtn.disabled = !ready || state.saving;
    el.templateName.disabled = !ready;
    el.closeBtn.disabled = state.saving;
  }

  function markDirty() {
    if (!state.initialized) return;
    state.dirty = true;
    state.editVersion += 1;
    setSaveState('Unsaved changes', 'warning');
    el.formError.hidden = true;
  }

  function clearPending() {
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The editor was restarted. Please try saving again.'));
    }
    state.pending.clear();
  }

  function showEditorError(message) {
    clearTimeout(state.loadTimer);
    state.editorReady = false;
    el.editorCard.classList.remove('is-loading');
    el.editorCard.classList.add('is-error');
    el.editorLoader.hidden = false;
    el.loaderBusy.hidden = true;
    el.loaderError.hidden = false;
    el.retryEditorBtn.disabled = !state.storageReady;
    el.useFallbackBtn.disabled = !state.storageReady;
    setSaveState(message || 'Editor unavailable', 'warning');
    updateActions();
  }

  function startEditor() {
    if (!state.storageReady) return;
    clearTimeout(state.loadTimer);
    clearPending();
    state.session = crypto.randomUUID();
    state.editorReady = false;
    state.initialized = false;
    state.fallbackActive = false;
    el.editorCard.classList.add('is-loading');
    el.editorCard.classList.remove('is-error');
    el.editorLoader.hidden = el.loaderBusy.hidden = false;
    el.loaderError.hidden = true;
    el.editorFrame.hidden = false;
    el.templateBody.hidden = true;
    setSaveState('Loading editor…');
    updateActions();
    el.editorFrame.src = `editor-sandbox.html?session=${encodeURIComponent(state.session)}`;
    state.loadTimer = setTimeout(() => showEditorError('Editor loading timed out'), 20000);
  }

  function finishLoading() {
    clearTimeout(state.loadTimer);
    el.editorCard.classList.remove('is-loading', 'is-error');
    el.editorLoader.hidden = true;
    state.initialized = true;
    updateActions();
    setSaveState(state.dirty ? 'Unsaved changes' : state.templateId ? 'Saved' : 'Not saved yet', state.dirty ? 'warning' : '');
    el.templateName.focus();
  }

  function activateFallbackEditor() {
    if (!state.storageReady) return;
    clearPending();
    state.session = '';
    state.editorReady = false;
    state.fallbackActive = true;
    el.editorFrame.hidden = true;
    el.editorFrame.src = 'about:blank';
    el.templateBody.hidden = false;
    el.templateBody.value = state.editorHtml;
    finishLoading();
    setSaveState('HTML fallback mode', 'warning');
    el.templateBody.focus();
  }

  function postToEditor(type, payload = {}) {
    el.editorFrame.contentWindow.postMessage({
      channel: CHANNEL, direction: 'parent-to-sandbox', session: state.session, type, ...payload
    }, '*');
  }

  function requestEditorHtml() {
    if (state.fallbackActive) return Promise.resolve(el.templateBody.value);
    if (!state.editorReady) return Promise.reject(new Error('The editor is not ready.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(requestId);
        reject(new Error('The editor did not respond. Your draft has not been saved; please try again.'));
      }, 3000);
      state.pending.set(requestId, { resolve, reject, timer });
      postToEditor('GET_HTML', { requestId });
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== el.editorFrame.contentWindow || state.fallbackActive || !state.storageReady) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.direction !== 'sandbox-to-parent' || data.session !== state.session) return;
    switch (data.type) {
      case 'READY':
        postToEditor('SET_HTML', { requestId: 'initial', html: state.editorHtml, silent: true });
        break;
      case 'SET_DONE':
        if (data.requestId !== 'initial' || state.initialized) break;
        state.editorReady = true;
        finishLoading();
        break;
      case 'CHANGE':
        if (typeof data.html === 'string' && data.html !== state.editorHtml) { state.editorHtml = data.html; markDirty(); }
        break;
      case 'HTML': {
        const pending = state.pending.get(data.requestId);
        if (!pending) break;
        clearTimeout(pending.timer);
        state.pending.delete(data.requestId);
        if (typeof data.html === 'string') pending.resolve(data.html);
        else pending.reject(new Error('The editor returned invalid content.'));
        break;
      }
      case 'TOAST': showToast(data.message || '', Boolean(data.error)); break;
      case 'SAVE_REQUEST': saveTemplate(); break;
      case 'ERROR': showEditorError('Editor unavailable'); break;
      default: break;
    }
  });

  async function saveTemplate({ closeAfter = false } = {}) {
    if (state.saving || !state.initialized || !state.storageReady) return;
    state.saving = true;
    updateActions();
    const editVersion = state.editVersion;
    const name = el.templateName.value.trim();
    try {
      const rawHtml = await requestEditorHtml();
      if (rawHtml.length > TemplateStorage.MAX_HTML_LENGTH) throw new Error('This template is too large (maximum 500,000 characters).');
      const html = TemplateSanitizer.prepareForEditor(rawHtml);
      const preview = new DOMParser().parseFromString(html, 'text/html');
      if (!name) throw new Error('Please enter a template name.');
      if (!preview.body.textContent.trim() && !preview.querySelector('img')) throw new Error('Please enter some email content.');
      setSaveState('Saving…');
      const timestamp = Date.now();
      const result = await TemplateStorage.upsert({
        id: state.templateId || crypto.randomUUID(), name, html,
        createdAt: state.createdAt || timestamp, updatedAt: timestamp
      }, state.revision);
      state.templateId = result.template.id;
      state.revision = result.template.revision;
      state.createdAt = result.template.createdAt;
      history.replaceState(null, '', `editor.html?id=${encodeURIComponent(state.templateId)}`);
      el.editorMode.textContent = 'EDIT TEMPLATE';
      el.editorTitle.textContent = 'Edit template';
      state.dirty = state.editVersion !== editVersion;
      if (state.dirty) setSaveState('New changes remain unsaved', 'warning');
      else setSaveState(result.synced ? 'Saved • Chrome Sync active' : 'Saved locally • Sync pending', result.synced ? 'saved' : 'warning');
      showToast(result.synced ? 'Template saved' : result.error || 'Saved locally; sync is pending.');
      if (closeAfter && !state.dirty) closeEditor();
    } catch (error) {
      state.dirty = true;
      el.formError.textContent = error.message || 'Could not save the template.';
      el.formError.hidden = false;
      setSaveState('Not saved', 'warning');
    } finally {
      state.saving = false;
      updateActions();
    }
  }

  el.templateName.addEventListener('input', markDirty);
  el.templateBody.addEventListener('input', () => { state.editorHtml = el.templateBody.value; markDirty(); });
  el.templateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveTemplate({ closeAfter: event.submitter?.dataset.close === 'true' });
  });
  el.closeBtn.addEventListener('click', () => {
    if (state.saving || (state.dirty && !confirm('Close without saving your changes?'))) return;
    closeEditor();
  });
  el.retryEditorBtn.addEventListener('click', startEditor);
  el.useFallbackBtn.addEventListener('click', activateFallbackEditor);
  window.addEventListener('beforeunload', (event) => {
    if (!state.allowClose && (state.dirty || state.saving)) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveTemplate();
    }
  });

  async function init() {
    updateActions();
    const result = await TemplateStorage.load();
    state.templateId = new URLSearchParams(location.search).get('id') || null;
    const template = result.templates.find((item) => item.id === state.templateId);
    if (state.templateId && !template) throw new Error('The selected template no longer exists. Close this window and create a new template.');
    if (template) {
      state.revision = template.revision;
      state.createdAt = template.createdAt;
      state.editorHtml = TemplateSanitizer.prepareForEditor(template.html);
      el.templateName.value = template.name;
      el.editorMode.textContent = 'EDIT TEMPLATE';
      el.editorTitle.textContent = 'Edit template';
    }
    state.storageReady = true;
    if (result.entitlements && !result.entitlements.richEditor) {
      activateFallbackEditor();
      setSaveState('Basic editor • Free plan', 'warning');
    } else {
      startEditor();
    }
  }
  init().catch((error) => {
    showEditorError('Could not load template storage');
    el.formError.textContent = error.message;
    el.formError.hidden = false;
  });
})();
