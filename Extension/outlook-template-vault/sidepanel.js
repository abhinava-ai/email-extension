(() => {
  const state = {
    templates: [],
    toastTimer: null,
    refreshing: false,
    refreshAgain: false,
    authMode: 'signIn',
    entitlements: { plan: 'Private', templateLimit: null, chromeSync: false, richEditor: true }
  };

  const el = {
    templateList: document.getElementById('templateList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    newTemplateBtn: document.getElementById('newTemplateBtn'),
    emptyNewBtn: document.getElementById('emptyNewBtn'),
    syncBanner: document.getElementById('syncBanner'),
    syncText: document.getElementById('syncText'),
    retrySyncBtn: document.getElementById('retrySyncBtn'),
    toast: document.getElementById('toast'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    signedOutView: document.getElementById('signedOutView'),
    signedInView: document.getElementById('signedInView'),
    showSignInBtn: document.getElementById('showSignInBtn'),
    showCreateAccountBtn: document.getElementById('showCreateAccountBtn'),
    authForm: document.getElementById('authForm'),
    authFormTitle: document.getElementById('authFormTitle'),
    authNameField: document.getElementById('authNameField'),
    authName: document.getElementById('authName'),
    authEmail: document.getElementById('authEmail'),
    authPassword: document.getElementById('authPassword'),
    authError: document.getElementById('authError'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    cancelAuthBtn: document.getElementById('cancelAuthBtn'),
    accountAvatar: document.getElementById('accountAvatar'),
    accountName: document.getElementById('accountName'),
    accountEmail: document.getElementById('accountEmail'),
    accountPlan: document.getElementById('accountPlan'),
    signOutBtn: document.getElementById('signOutBtn')
  };

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function plainPreview(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function makeId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message, isError = false) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2800);
  }

  function setSyncStatus(text, mode = '') {
    el.syncText.textContent = text;
    el.syncBanner.classList.remove('synced', 'warning');
    if (mode) el.syncBanner.classList.add(mode);
    el.retrySyncBtn.hidden = mode !== 'warning';
  }

  function showAuthForm(mode) {
    state.authMode = mode;
    const registering = mode === 'signUp';
    el.authForm.hidden = false;
    el.authNameField.hidden = !registering;
    el.authName.required = registering;
    el.authPassword.autocomplete = registering ? 'new-password' : 'current-password';
    el.authFormTitle.textContent = registering ? 'Create account' : 'Sign in';
    el.authSubmitBtn.textContent = registering ? 'Create account' : 'Sign in';
    el.authError.hidden = true;
    (registering ? el.authName : el.authEmail).focus();
  }

  function renderAccount(authState) {
    const user = authState?.user || null;
    el.signedOutView.hidden = Boolean(user);
    el.signedInView.hidden = !user;
    if (!user) return;
    const name = String(user.displayName || '').trim() || 'Mail Template Vault user';
    const email = user.email || '';
    el.accountName.textContent = name;
    el.accountEmail.textContent = email;
    el.accountAvatar.textContent = (name || email || 'A').slice(0, 1).toUpperCase();
    const plan = 'Private';
    el.accountPlan.textContent = plan;
    el.accountPlan.classList.toggle('pro', plan !== 'Free');
    el.authForm.hidden = true;
  }

  async function initializeAccount() {
    if (!globalThis.ExtensionAuth) return;
    ExtensionAuth.onChange(renderAccount);
    try {
      renderAccount(await ExtensionAuth.initialize());
    } catch (error) {
      console.error('Could not initialize account:', error);
      showToast('Account sign-in is temporarily unavailable. Local templates still work.', true);
    }
  }

  function render() {
    const q = el.searchInput.value.trim().toLowerCase();
    const filtered = state.templates
      .filter((template) => {
        if (!q) return true;
        return template.name.toLowerCase().includes(q) || plainPreview(template.html).toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    el.templateList.innerHTML = '';
    el.emptyState.hidden = filtered.length !== 0 || Boolean(q);

    if (!filtered.length && q) {
      const noResults = document.createElement('div');
      noResults.className = 'empty-state';
      noResults.innerHTML = '<h2>No matches</h2><p>Try another search term.</p>';
      el.templateList.appendChild(noResults);
      return;
    }

    for (const template of filtered) {
      const card = document.createElement('article');
      card.className = 'template-card';
      card.innerHTML = `
        <button class="template-insert" type="button" data-insert="${escapeHtml(template.id)}" title="Insert into Outlook">
          <span class="template-name">${escapeHtml(template.name)}</span>
          <span class="template-preview">${escapeHtml(plainPreview(template.html) || 'Empty template')}</span>
        </button>
        <div class="card-actions">
          <button type="button" data-edit="${escapeHtml(template.id)}" title="Open large editor" aria-label="Edit ${escapeHtml(template.name)}">✎</button>
          <button type="button" class="delete" data-delete="${escapeHtml(template.id)}" title="Delete" aria-label="Delete ${escapeHtml(template.name)}">×</button>
        </div>
      `;
      el.templateList.appendChild(card);
    }
  }

  async function loadTemplates({ quiet = false } = {}) {
    if (state.refreshing) { state.refreshAgain = true; return; }
    state.refreshing = true;
    if (!quiet) setSyncStatus('Loading templates…');

    try {
      const result = await TemplateStorage.load();
      if (result.entitlements) state.entitlements = result.entitlements;
      const loadedTemplates = Array.isArray(result.templates) ? result.templates : [];
      state.templates = loadedTemplates.map((template) => {
        return { ...template, html: TemplateSanitizer.sanitize(template.html) };
      });

      render();
      renderAccount(globalThis.ExtensionAuth?.getState());
      el.exportBtn.disabled = el.importBtn.disabled = false;

      const limitReached = Number.isSafeInteger(state.entitlements.templateLimit) &&
        state.templates.length >= state.entitlements.templateLimit;
      el.newTemplateBtn.title = limitReached ? 'Free plan template limit reached' : 'Create a template';
      el.emptyNewBtn.title = el.newTemplateBtn.title;

      if (result.remote) {
        setSyncStatus('Synced with private workspace', 'synced');
      } else if (result.error) {
        setSyncStatus('Offline cache • Server unavailable', 'warning');
      } else if (!result.syncAvailable) {
        setSyncStatus('Local storage active • Sync unavailable', 'warning');
      } else if (result.syncPending) {
        setSyncStatus('Saved locally • Changes pending sync', 'warning');
      } else if (result.source === 'sync') {
        setSyncStatus('Synced from Chrome • Local copy updated', 'synced');
      } else {
        setSyncStatus('Saved locally • Chrome Sync ready', 'synced');
      }
    } finally {
      state.refreshing = false;
      if (state.refreshAgain) {
        state.refreshAgain = false;
        loadTemplates({ quiet: true }).catch(console.error);
      }
    }
  }

  function showPersistStatus(result) {
    if (result.remote || result.synced) {
      setSyncStatus('Synced with private workspace', 'synced');
      return;
    }
    if (result.synced) {
      setSyncStatus('Saved locally • Chrome Sync active', 'synced');
    } else {
      setSyncStatus('Saved locally • Sync quota/error', 'warning');
    }
  }

  async function openEditorPopup(templateId = '') {
    if (!templateId && Number.isSafeInteger(state.entitlements.templateLimit) &&
        state.templates.length >= state.entitlements.templateLimit) {
      showToast(`Free includes up to ${state.entitlements.templateLimit} templates. Upgrade to Pro for unlimited templates.`, true);
      return;
    }
    const embedded = new URLSearchParams(location.search).get('floating') === '1';
    const query = `${templateId ? `?id=${encodeURIComponent(templateId)}&` : '?'}embedded=1`;
    const url = chrome.runtime.getURL(`editor.html${query}`);

    if (embedded) {
      const overlay = document.createElement('iframe');
      overlay.id = 'embeddedEditor';
      overlay.src = url;
      overlay.title = 'Template editor';
      overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:9999';
      document.body.appendChild(overlay);
      return;
    }

    try {
      const current = await chrome.windows.getCurrent();
      const targetWidth = Math.max(700, Math.min(900, (current.width || 1200) - 80));
      const targetHeight = Math.max(580, Math.min(720, (current.height || 900) - 60));
      const left = Number.isFinite(current.left) && Number.isFinite(current.width)
        ? Math.max(0, Math.round(current.left + ((current.width - targetWidth) / 2)))
        : undefined;
      const top = Number.isFinite(current.top) && Number.isFinite(current.height)
        ? Math.max(0, Math.round(current.top + ((current.height - targetHeight) / 2)))
        : undefined;

      const createData = {
        url,
        type: 'popup',
        focused: true,
        width: targetWidth,
        height: targetHeight
      };
      if (Number.isFinite(left)) createData.left = left;
      if (Number.isFinite(top)) createData.top = top;
      await chrome.windows.create(createData);
    } catch (error) {
      console.warn('Could not open extension popup window, falling back to a normal window.', error);
      window.open(url, '_blank', 'popup=yes,width=900,height=720,resizable=yes,scrollbars=yes');
    }
  }

  async function insertTemplate(template) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast('No active Outlook tab found.', true);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'ETM_INSERT_TEMPLATE',
        html: TemplateSanitizer.sanitize(template.html)
      });

      if (response?.ok) {
        showToast(`Inserted: ${template.name}`);
      } else {
        showToast(response?.error || 'Could not insert into Outlook.', true);
      }
    } catch (_) {
      showToast('Open Outlook on the web, start an email, and click inside the message body first.', true);
    }
  }

  el.showSignInBtn.addEventListener('click', () => showAuthForm('signIn'));
  el.showCreateAccountBtn.hidden = true;
  el.cancelAuthBtn.addEventListener('click', () => {
    el.authForm.hidden = true;
    el.authError.hidden = true;
    el.authForm.reset();
  });
  el.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    el.authSubmitBtn.disabled = true;
    el.authError.hidden = true;
    try {
      const email = el.authEmail.value.trim();
      const password = el.authPassword.value;
      const account = await ExtensionAuth.signIn(email, password);
      if (account.user?.mustChangePassword) throw new Error('Change your temporary password in the web app before using templates.');
      el.authForm.reset();
      el.authForm.hidden = true;
      showToast('Signed in');
    } catch (error) {
      el.authError.textContent = error?.message || 'Could not complete account authentication.';
      el.authError.hidden = false;
    } finally {
      el.authSubmitBtn.disabled = false;
    }
  });
  el.signOutBtn.addEventListener('click', async () => {
    el.signOutBtn.disabled = true;
    try {
      await ExtensionAuth.signOut();
      showToast('Signed out. Your local templates are still available.');
    } catch (error) {
      showToast(error?.message || 'Could not sign out.', true);
    } finally {
      el.signOutBtn.disabled = false;
    }
  });

  el.newTemplateBtn.addEventListener('click', () => openEditorPopup());
  el.emptyNewBtn.addEventListener('click', () => openEditorPopup());
  el.searchInput.addEventListener('input', render);
  el.retrySyncBtn.addEventListener('click', async () => {
    el.retrySyncBtn.disabled = true;
    try {
      const result = await TemplateStorage.reconcile();
      await loadTemplates({ quiet: true });
      if (!result.synced) showToast(result.error || 'Sync is still pending. Your local templates are safe.', true);
    } catch (error) {
      showToast(error.message || 'Could not retry sync.', true);
    } finally {
      el.retrySyncBtn.disabled = false;
    }
  });

  el.templateList.addEventListener('click', async (event) => {
    const insertButton = event.target.closest('[data-insert]');
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');

    if (insertButton) {
      const template = state.templates.find((item) => item.id === insertButton.dataset.insert);
      if (template) await insertTemplate(template);
      return;
    }

    if (editButton) {
      await openEditorPopup(editButton.dataset.edit);
      return;
    }

    if (deleteButton) {
      const template = state.templates.find((item) => item.id === deleteButton.dataset.delete);
      if (!template) return;
      if (!confirm(`Delete “${template.name}”?`)) return;
      deleteButton.disabled = true;
      try {
        const result = await TemplateStorage.remove(template.id, template.revision);
        await loadTemplates({ quiet: true });
        showPersistStatus(result);
        showToast('Template deleted');
      } catch (error) {
        showToast(error.message || 'Could not delete the template.', true);
      } finally {
        deleteButton.disabled = false;
      }
    }
  });

  el.exportBtn.addEventListener('click', () => {
    const payload = {
      app: 'Mail Template Vault for Outlook',
      version: 2,
      exportedAt: new Date().toISOString(),
      templates: state.templates
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `outlook-templates-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  el.importBtn.addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', async () => {
    const file = el.importFile.files?.[0];
    if (!file) return;

    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Backups must be smaller than 5 MB.');
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.templates) || parsed.templates.length > TemplateStorage.MAX_TEMPLATES) {
        throw new Error('Invalid backup or too many templates (maximum 500).');
      }

      const clean = parsed.templates
        .map((item) => {
          const record = TemplateStorage.validateTemplate({
            ...item,
            id: item?.id ?? makeId(),
            createdAt: item?.createdAt ?? Date.now(),
            updatedAt: item?.updatedAt ?? Date.now()
          });
          return { ...record, html: TemplateSanitizer.sanitize(record.html) };
        });
      if (new Set(clean.map((item) => item.id)).size !== clean.length) {
        throw new Error('The backup contains duplicate template IDs.');
      }

      if (!confirm(`Import ${clean.length} template(s)? This will replace the current list.`)) return;
      const result = await TemplateStorage.replaceFromImport(clean);
      await loadTemplates({ quiet: true });
      showPersistStatus(result);
      showToast('Templates imported');
    } catch (error) {
      showToast(error?.message || 'Could not import the backup.', true);
    } finally {
      el.importFile.value = '';
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    const localChanged = areaName === 'local' && changes[TemplateStorage.LOCAL_KEY];
    const syncChanged = areaName === 'sync' && changes[TemplateStorage.MANIFEST_KEY];
    if (localChanged || syncChanged) loadTemplates({ quiet: true }).catch(console.error);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ETM_TEMPLATES_UPDATED') {
      loadTemplates({ quiet: true }).catch(console.error);
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.type !== 'MTV_EDITOR_CLOSE') return;
    document.getElementById('embeddedEditor')?.remove();
    loadTemplates({ quiet: true }).catch(console.error);
  });

  initializeAccount();
  loadTemplates().catch((error) => {
    console.error(error);
    setSyncStatus('Could not load templates', 'warning');
    showToast('Could not load template storage.', true);
  });
})();
