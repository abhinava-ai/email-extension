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
    toast: document.getElementById('toast'),
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
    signOutBtn: document.getElementById('signOutBtn'),
    syncBtn: document.getElementById('syncBtn')
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

  function showToast(message, isError = false) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2800);
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
    el.syncBtn.hidden = !user;
    if (!user) return;
    const name = String(user.displayName || '').trim() || 'Mail Template Vault user';
    const email = user.email || '';
    el.accountName.textContent = name;
    el.accountEmail.textContent = email;
    el.accountAvatar.textContent = (name || email || 'A').slice(0, 1).toUpperCase();
    if (el.accountPlan) {
      el.accountPlan.textContent = 'Private';
      el.accountPlan.classList.add('pro');
    }
    el.authForm.hidden = true;
  }

  async function initializeAccount() {
    if (!globalThis.ExtensionAuth) return;
    ExtensionAuth.onChange(renderAccount);
    try {
      renderAccount(await ExtensionAuth.initialize());
    } catch (error) {
      console.error('Could not initialize account:', error);
      showToast('Account sign-in is temporarily unavailable.', true);
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
      card.dataset.insert = template.id;
      card.innerHTML = `
        <button class="template-insert" type="button" aria-label="Insert ${escapeHtml(template.name)} into Outlook">
          <span class="template-name">${escapeHtml(template.name)}</span>
          <span class="template-preview">${escapeHtml(plainPreview(template.html) || 'Empty template')}</span>
        </button>
      `;
      el.templateList.appendChild(card);
    }
  }

  function templateFingerprint(templates) {
    return JSON.stringify(templates.map(({ id, name, html, serverVersion, updatedAt }) =>
      [id, name, html, serverVersion || 0, updatedAt || 0]));
  }

  async function loadTemplates({ quiet = false } = {}) {
    if (state.refreshing) { state.refreshAgain = true; return; }
    state.refreshing = true;
    el.syncBtn.disabled = true;
    el.syncBtn.textContent = 'Syncing…';
    try {
      const result = await TemplateStorage.load();
      if (result.entitlements) state.entitlements = result.entitlements;
      const loadedTemplates = Array.isArray(result.templates) ? result.templates : [];
      const nextTemplates = loadedTemplates.map((template) => {
        return { ...template, html: TemplateSanitizer.sanitize(template.html) };
      });
      if (templateFingerprint(nextTemplates) !== templateFingerprint(state.templates)) {
        state.templates = nextTemplates;
        render();
      }
      renderAccount(globalThis.ExtensionAuth?.getState());
      if (!result.remote && result.error && !quiet) showToast(result.error, true);
    } finally {
      state.refreshing = false;
      el.syncBtn.disabled = false;
      el.syncBtn.textContent = 'Sync';
      if (state.refreshAgain) {
        state.refreshAgain = false;
        loadTemplates({ quiet: true }).catch(console.error);
      }
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
      await loadTemplates({ quiet: true });
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
      await chrome.runtime.sendMessage({ type: 'ETM_CLEAR_TEMPLATE_DATA' });
      state.templates = [];
      render();
      showToast('Signed out');
    } catch (error) {
      showToast(error?.message || 'Could not sign out.', true);
    } finally {
      el.signOutBtn.disabled = false;
    }
  });

  el.searchInput.addEventListener('input', render);
  el.syncBtn.addEventListener('click', async () => {
    try {
      await loadTemplates({ quiet: false });
      showToast('Templates synced');
    } catch (error) {
      showToast(error?.message || 'Could not sync templates.', true);
    }
  });

  el.templateList.addEventListener('click', async (event) => {
    const insertTarget = event.target.closest('[data-insert]');
    if (insertTarget) {
      const template = state.templates.find((item) => item.id === insertTarget.dataset.insert);
      if (template) await insertTemplate(template);
    }
  });

  (async () => {
    await initializeAccount();
    try { await loadTemplates(); }
    catch (error) {
      state.templates = [];
      render();
      if (ExtensionAuth.getState()?.user) throw error;
    }
  })().catch((error) => {
    console.error(error);
    showToast('Could not load template storage.', true);
  });
})();
