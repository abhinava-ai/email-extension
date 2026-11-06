(() => {
  const WEEK = 7 * 86400000;
  const SORT_LABELS = { name: 'Name A–Z', recent: 'Recently updated' };
  const floating = new URLSearchParams(location.search).get('floating') === '1';
  const openedForSignIn = new URLSearchParams(location.search).get('signin') === '1';
  const ICONS = {
    tile: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.7 5.300 2.700 7.300 8 8-5.300.7-7.300 2.700-8 8-.7-5.300-2.700-7.300-8-8 5.300-.7 7.300-2.700 8-8z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.500" r="1.800"/><circle cx="12" cy="12" r="1.800"/><circle cx="12" cy="18.500" r="1.800"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    insert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 20h14"/></svg>'
  };
  const state = {
    templates: [],
    toastTimer: null,
    refreshing: false,
    refreshAgain: false,
    authChecked: false,
    loadFailed: false,
    loaded: false,
    inserting: false,
    menuTemplateId: null,
    previewTemplateId: null,
    recentOnly: false,
    authMode: 'signIn',
    preferences: { sortOrder: 'name', closeAfterInsert: false },
    entitlements: { plan: 'Private', templateLimit: null, chromeSync: false, richEditor: true }
  };

  const el = Object.fromEntries([
    'templateList', 'skeletonList', 'emptyState', 'errorState', 'errorMessage', 'retryLoadBtn', 'searchInput', 'toast',
    'signedOutView', 'signedInView', 'signedInTools', 'showSignInBtn', 'showCreateAccountBtn', 'authForm', 'authFormTitle',
    'authNameField', 'authName', 'authEmail', 'authPassword', 'authError', 'authSubmitBtn', 'cancelAuthBtn',
    'accountAvatar', 'accountName', 'accountEmail', 'signOutBtn', 'syncBtn', 'templateCount', 'sortLabel',
    'menuBtn', 'navMenu', 'openSettingsBtn', 'openDashboardBtn', 'filterBtn', 'filterMenu', 'filterDot', 'recentOnlyBtn',
    'cardMenu', 'previewSheet', 'previewTitle', 'previewBody', 'previewInsertBtn', 'closePreviewBtn', 'addTemplateFab'
  ].map((id) => [id, document.getElementById(id)]));

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function plainPreview(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function relativeTime(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    const minutes = Math.round((timestamp - Date.now()) / 60000);
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 30) return format.format(days, 'day');
    return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function personName(email) {
    const local = String(email || '').split('@')[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Shared library';
  }

  function isRecent(template) {
    return Number.isFinite(template.updatedAt) && Date.now() - template.updatedAt < WEEK;
  }

  function findTemplate(id) {
    return state.templates.find((item) => item.id === id) || null;
  }

  function showToast(message, isError = false) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = true;
    // Re-showing restarts the entrance animation for repeated notices.
    requestAnimationFrame(() => { el.toast.hidden = false; });
    state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 4500 : 2800);
  }

  function showAuthForm(mode) {
    state.authMode = mode;
    const registering = mode === 'signUp';
    el.authForm.hidden = false;
    el.showSignInBtn.hidden = true;
    el.authNameField.hidden = !registering;
    el.authName.required = registering;
    el.authPassword.autocomplete = registering ? 'new-password' : 'current-password';
    el.authFormTitle.textContent = registering ? 'Create account' : 'Sign in';
    el.authSubmitBtn.textContent = registering ? 'Create account' : 'Sign in';
    el.authError.hidden = true;
    (registering ? el.authName : el.authEmail).focus();
  }

  function hideAuthForm() {
    el.authForm.hidden = true;
    el.authError.hidden = true;
    el.authForm.reset();
    el.showSignInBtn.hidden = false;
  }

  function currentUser() {
    return globalThis.ExtensionAuth?.getState?.()?.user || null;
  }

  function renderAccount(authState) {
    const user = authState?.user || null;
    el.signedInView.hidden = !user;
    el.signOutBtn.hidden = !user;
    el.syncBtn.hidden = !user;
    el.addTemplateFab.hidden = !user;
    if (user) {
      const name = String(user.displayName || '').trim() || 'Mail Template Vault user';
      const email = user.email || '';
      el.accountName.textContent = name;
      el.accountEmail.textContent = email;
      el.accountAvatar.textContent = (name || email || 'A').slice(0, 1).toUpperCase();
      hideAuthForm();
    }
    render();
  }

  // Answers one question before anything is shown: signed in, signed out, or unknown
  // because the check itself failed. Unknown still tries to load, and offers a retry.
  async function initializeAccount() {
    if (!globalThis.ExtensionAuth) return 'unknown';
    ExtensionAuth.onChange(renderAccount);
    try {
      const auth = await ExtensionAuth.initialize();
      if (auth.user?.mustChangePassword) {
        await ExtensionAuth.signOut();
        state.authChecked = true;
        showAuthForm('signIn');
        el.authError.textContent = 'Change your temporary password in the web dashboard, then sign in here.';
        el.authError.hidden = false;
        return 'signedOut';
      }
      renderAccount(auth);
      if (auth.user) return 'signedIn';
      return auth.unreachable ? 'unknown' : 'signedOut';
    } catch (error) {
      console.error('Could not initialize account:', error);
      showToast('Account sign-in is temporarily unavailable.', true);
      return 'unknown';
    }
  }

  function filteredTemplates() {
    const q = el.searchInput.value.trim().toLowerCase();
    const sorted = state.templates
      .filter((template) => {
        if (state.recentOnly && !isRecent(template)) return false;
        if (!q) return true;
        return template.name.toLowerCase().includes(q) || plainPreview(template.html).toLowerCase().includes(q);
      });
    return state.preferences.sortOrder === 'recent'
      ? sorted.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.name.localeCompare(b.name))
      : sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  function cardHtml(template) {
    const name = escapeHtml(template.name);
    const updated = relativeTime(template.updatedAt);
    const person = personName(template.updatedBy);
    return `
      <div class="card-top">
        <span class="card-tile">${ICONS.tile}</span>
        <span class="template-name" title="${name}">${name}</span>
        ${isRecent(template) ? `<span class="chip">${ICONS.spark}Updated</span>` : ''}
        <button class="card-more" type="button" data-menu="${escapeHtml(template.id)}" aria-label="More actions for ${name}" aria-haspopup="menu" aria-expanded="false">${ICONS.more}</button>
      </div>
      <p class="template-preview">${escapeHtml(plainPreview(template.html) || 'Empty template')}</p>
      ${updated ? `<div class="card-meta">${ICONS.clock}<span>Updated ${escapeHtml(updated)}</span></div>` : ''}
      <div class="card-action">
        <span class="person"><span class="avatar">${escapeHtml(person.charAt(0))}</span><span>${escapeHtml(person)}</span></span>
        <button class="template-insert" type="button" aria-label="Insert ${name} into Outlook">${ICONS.insert}Insert Template</button>
      </div>`;
  }

  function render() {
    const q = el.searchInput.value.trim();
    const filtering = Boolean(q) || state.recentOnly;
    const filtered = filteredTemplates();
    const checking = !state.authChecked;
    const signedOut = !checking && !currentUser() && !state.templates.length && !globalThis.ExtensionAuth?.getState?.()?.unreachable;
    const loading = checking || (!state.loaded && !signedOut);
    const showTools = !checking && !signedOut;

    el.signedOutView.hidden = !signedOut;
    el.signedInTools.hidden = !showTools;
    el.skeletonList.hidden = !loading;
    el.errorState.hidden = !(!checking && state.loadFailed && !state.templates.length && !signedOut);
    el.emptyState.hidden = !(!checking && state.loaded && !state.loadFailed && !state.templates.length && !signedOut);
    el.templateCount.textContent = signedOut || loading ? '' : filtering
      ? `${filtered.length} of ${state.templates.length} Templates`
      : `${state.templates.length} Templates`;
    el.sortLabel.textContent = SORT_LABELS[state.preferences.sortOrder] || SORT_LABELS.name;
    el.filterDot.hidden = !state.recentOnly;

    el.templateList.innerHTML = '';
    if (!filtered.length && filtering && state.templates.length) {
      const noResults = document.createElement('div');
      noResults.className = 'empty-state';
      noResults.innerHTML = '<h2>No matches</h2><p>Try another search term or clear the filter.</p>';
      el.templateList.appendChild(noResults);
      return;
    }

    for (const template of filtered) {
      const card = document.createElement('article');
      card.className = 'template-card';
      card.dataset.insert = template.id;
      card.innerHTML = cardHtml(template);
      el.templateList.appendChild(card);
    }
  }

  function templateFingerprint(templates) {
    return JSON.stringify(templates.map(({ id, name, html, serverVersion, updatedAt }) =>
      [id, name, html, serverVersion || 0, updatedAt || 0]));
  }

  function setSyncing(syncing) {
    el.syncBtn.disabled = syncing;
    el.syncBtn.classList.toggle('is-syncing', syncing);
    el.syncBtn.setAttribute('aria-label', syncing ? 'Syncing…' : 'Sync templates');
  }

  async function loadTemplates({ quiet = false } = {}) {
    if (state.refreshing) { state.refreshAgain = true; return; }
    state.refreshing = true;
    setSyncing(true);
    try {
      const result = await TemplateStorage.load();
      if (result.entitlements) state.entitlements = result.entitlements;
      const loadedTemplates = Array.isArray(result.templates) ? result.templates : [];
      const nextTemplates = loadedTemplates.map((template) => {
        return { ...template, html: TemplateSanitizer.sanitize(template.html) };
      });
      state.loadFailed = false;
      state.loaded = true;
      if (templateFingerprint(nextTemplates) !== templateFingerprint(state.templates)) state.templates = nextTemplates;
      renderAccount(globalThis.ExtensionAuth?.getState());
      if (!result.remote && result.error && !quiet) showToast(result.error, true);
    } catch (error) {
      state.loaded = true;
      if (/sign in/i.test(error?.message || '') && globalThis.ExtensionAuth) {
        // The session is over, so nothing from it stays on screen.
        state.templates = [];
        state.loadFailed = false;
        await ExtensionAuth.initialize().catch(() => {});
        render();
        throw error;
      }
      state.loadFailed = true;
      el.errorMessage.textContent = error?.message || 'Check your connection and try again.';
      render();
      throw error;
    } finally {
      state.refreshing = false;
      setSyncing(false);
      if (state.refreshAgain) {
        state.refreshAgain = false;
        loadTemplates({ quiet: true }).catch(console.error);
      }
    }
  }

  async function targetTab() {
    const own = floating && chrome.tabs.getCurrent ? await chrome.tabs.getCurrent().catch(() => null) : null;
    if (own?.id) return own;
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return active || null;
  }

  async function sendInsert(tabId, html) {
    const message = { type: 'ETM_INSERT_TEMPLATE', html };
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (firstError) {
      // Outlook tabs opened before the extension was installed or updated have no content script yet.
      if (!chrome.scripting?.executeScript) throw firstError;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['sanitizer.js', 'content.js', 'floating.js'] });
      return chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function insertTemplate(template, card) {
    // A fast double click must not put the template into the email twice.
    if (state.inserting) return;
    state.inserting = true;
    card?.classList.add('is-inserting');
    try {
      const tab = await targetTab();
      if (!tab?.id) {
        showToast('No active Outlook tab found.', true);
        return;
      }
      const response = await sendInsert(tab.id, TemplateSanitizer.sanitize(template.html));
      if (response?.ok) {
        showToast(`Inserted: ${template.name}`);
        if (floating && state.preferences.closeAfterInsert) {
          chrome.tabs.sendMessage(tab.id, { type: 'ETM_CLOSE_VAULT' }).catch(() => {});
        }
      } else {
        showToast(response?.error || 'Could not insert into Outlook.', true);
      }
    } catch (_) {
      showToast('Open Outlook on the web, start an email, and click inside the message body first.', true);
    } finally {
      state.inserting = false;
      card?.classList.remove('is-inserting');
    }
  }

  function closeMenus() {
    el.navMenu.hidden = true;
    el.filterMenu.hidden = true;
    el.cardMenu.hidden = true;
    el.menuBtn.setAttribute('aria-expanded', 'false');
    el.filterBtn.setAttribute('aria-expanded', 'false');
    document.querySelector('.card-more[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
    state.menuTemplateId = null;
  }

  function placeMenu(menu, anchor) {
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(innerWidth - menu.offsetWidth - 12, rect.right - menu.offsetWidth));
    const below = rect.bottom + 6;
    const top = below + menu.offsetHeight > innerHeight - 8 ? Math.max(8, rect.top - menu.offsetHeight - 6) : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function toggleMenu(menu, anchor, place = true) {
    const opening = menu.hidden;
    closeMenus();
    if (!opening) return;
    if (place) placeMenu(menu, anchor);
    else menu.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    menu.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
  }

  function updateFilterMenu() {
    for (const item of el.filterMenu.querySelectorAll('[data-sort]')) {
      item.setAttribute('aria-checked', String(item.dataset.sort === state.preferences.sortOrder));
    }
    el.recentOnlyBtn.setAttribute('aria-checked', String(state.recentOnly));
  }

  function openPortal(path = '') {
    const base = globalThis.ExtensionAuth?.getConfig?.().accountPortalUrl;
    if (!base) {
      showToast('The web dashboard address is not configured.', true);
      return;
    }
    chrome.tabs.create({ url: `${base}${path}` });
  }

  function copyTemplate(template) {
    // Works inside the Outlook iframe, where the async clipboard API can be blocked.
    const holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;';
    holder.innerHTML = TemplateSanitizer.toEmailHtml(template.html);
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand('copy');
    selection.removeAllRanges();
    holder.remove();
    showToast(copied ? `Copied: ${template.name}` : 'Could not copy this template.', !copied);
  }

  function openPreview(template) {
    state.previewTemplateId = template.id;
    el.previewTitle.textContent = template.name;
    // The same output that goes into the email, so the preview shows what Outlook will show.
    el.previewBody.innerHTML = TemplateSanitizer.toEmailHtml(template.html);
    el.previewSheet.hidden = false;
    el.closePreviewBtn.focus();
  }

  function closePreview() {
    el.previewSheet.hidden = true;
    el.previewBody.innerHTML = '';
    state.previewTemplateId = null;
  }

  async function runtimeResult(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response?.ok ? response.result : null;
    } catch (_) {
      return null;
    }
  }

  function announceAuthChange() {
    chrome.runtime.sendMessage({ type: 'ETM_AUTH_CHANGED' }).catch(() => {});
  }

  async function closeSignInTab() {
    const tab = await chrome.tabs.getCurrent?.().catch(() => null);
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }

  // Another window signed in or out, or the session was removed from the dashboard.
  async function refreshAfterAuthChange() {
    if (!globalThis.ExtensionAuth) return;
    await ExtensionAuth.initialize().catch(() => {});
    state.loaded = false;
    state.loadFailed = false;
    if (!currentUser()) state.templates = [];
    render();
    if (currentUser()) loadTemplates({ quiet: true }).catch(console.error);
    else { state.loaded = true; render(); }
  }

  async function loadPreferences() {
    const preferences = await runtimeResult({ type: 'ETM_PREFERENCES_GET' });
    if (preferences) state.preferences = preferences;
  }

  async function setSortOrder(sortOrder) {
    state.preferences = { ...state.preferences, sortOrder };
    render();
    const saved = await runtimeResult({ type: 'ETM_PREFERENCES_SET', preferences: { sortOrder } });
    if (saved) state.preferences = saved;
  }

  el.showSignInBtn.addEventListener('click', () => showAuthForm('signIn'));
  el.showCreateAccountBtn.hidden = true;
  el.cancelAuthBtn.addEventListener('click', hideAuthForm);
  el.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    el.authSubmitBtn.disabled = true;
    el.authError.hidden = true;
    try {
      const email = el.authEmail.value.trim();
      const password = el.authPassword.value;
      const account = await ExtensionAuth.signIn(email, password);
      if (account.user?.mustChangePassword) {
        // Otherwise the panel looks signed in while every template request is refused.
        await ExtensionAuth.signOut();
        showAuthForm('signIn');
        throw new Error('Change your temporary password in the web dashboard, then sign in here.');
      }
      el.authForm.reset();
      el.authForm.hidden = true;
      state.loaded = false;
      render();
      await loadTemplates({ quiet: true });
      showToast('Signed in');
      announceAuthChange();
      if (openedForSignIn) setTimeout(closeSignInTab, 1200);
    } catch (error) {
      el.authError.textContent = error?.message || 'Could not complete account authentication.';
      el.authError.hidden = false;
    } finally {
      el.authSubmitBtn.disabled = false;
    }
  });
  el.signOutBtn.addEventListener('click', async () => {
    closeMenus();
    el.signOutBtn.disabled = true;
    try {
      await ExtensionAuth.signOut();
      await chrome.runtime.sendMessage({ type: 'ETM_CLEAR_TEMPLATE_DATA' });
      state.templates = [];
      state.loadFailed = false;
      el.searchInput.value = '';
      render();
      showToast('Signed out');
      announceAuthChange();
    } catch (error) {
      showToast(error?.message || 'Could not sign out.', true);
    } finally {
      el.signOutBtn.disabled = false;
    }
  });

  el.searchInput.addEventListener('input', render);
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el.searchInput.value) {
      el.searchInput.value = '';
      render();
    }
  });
  el.syncBtn.addEventListener('click', async () => {
    try {
      await loadTemplates({ quiet: false });
      showToast('Templates synced');
    } catch (error) {
      showToast(error?.message || 'Could not sync templates.', true);
    }
  });
  el.retryLoadBtn.addEventListener('click', () => {
    state.loadFailed = false;
    state.loaded = false;
    render();
    loadTemplates().catch((error) => console.error(error));
  });

  el.menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(el.navMenu, el.menuBtn, false);
  });
  el.openSettingsBtn.addEventListener('click', () => { closeMenus(); chrome.runtime.openOptionsPage(); });
  el.openDashboardBtn.addEventListener('click', () => { closeMenus(); openPortal('/dashboard'); });
  el.addTemplateFab.addEventListener('click', () => openPortal('/templates'));
  el.filterBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    updateFilterMenu();
    toggleMenu(el.filterMenu, el.filterBtn);
  });
  el.filterMenu.addEventListener('click', (event) => {
    const item = event.target.closest('button');
    if (!item) return;
    if (item.dataset.sort) setSortOrder(item.dataset.sort);
    else {
      state.recentOnly = !state.recentOnly;
      render();
    }
    closeMenus();
  });

  el.templateList.addEventListener('click', async (event) => {
    const menuButton = event.target.closest('[data-menu]');
    if (menuButton) {
      event.stopPropagation();
      const id = menuButton.dataset.menu;
      const reopening = el.cardMenu.hidden || state.menuTemplateId !== id;
      closeMenus();
      if (!reopening) return;
      state.menuTemplateId = id;
      placeMenu(el.cardMenu, menuButton);
      menuButton.setAttribute('aria-expanded', 'true');
      el.cardMenu.querySelector('button').focus({ preventScroll: true });
      return;
    }
    const insertTarget = event.target.closest('[data-insert]');
    if (insertTarget) {
      closeMenus();
      const template = findTemplate(insertTarget.dataset.insert);
      if (template) await insertTemplate(template, insertTarget);
    }
  });

  el.cardMenu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-card-action]')?.dataset.cardAction;
    const template = findTemplate(state.menuTemplateId);
    closeMenus();
    if (!action || !template) return;
    if (action === 'insert') insertTemplate(template);
    else if (action === 'preview') openPreview(template);
    else if (action === 'copy') copyTemplate(template);
    else if (action === 'manage') openPortal('/templates');
  });

  el.closePreviewBtn.addEventListener('click', closePreview);
  el.previewSheet.addEventListener('click', (event) => { if (event.target === el.previewSheet) closePreview(); });
  el.previewInsertBtn.addEventListener('click', () => {
    const template = findTemplate(state.previewTemplateId);
    closePreview();
    if (template) insertTemplate(template);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu')) closeMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el.previewSheet.hidden) closePreview();
    else closeMenus();
  });
  window.addEventListener('resize', closeMenus);
  el.templateList.parentElement.addEventListener('scroll', closeMenus, { passive: true });

  chrome.runtime.onMessage?.addListener((message) => {
    if (message?.type === 'ETM_AUTH_CHANGED') {
      refreshAfterAuthChange().catch(console.error);
      return;
    }
    if (message?.type !== 'ETM_PREFERENCES_CHANGED' || !message.preferences) return;
    state.preferences = message.preferences;
    render();
  });

  renderAccount(null);
  (async () => {
    await loadPreferences();
    const session = await initializeAccount();
    state.authChecked = true;
    if (session === 'signedOut') {
      state.loaded = true;
      render();
      return;
    }
    render();
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
