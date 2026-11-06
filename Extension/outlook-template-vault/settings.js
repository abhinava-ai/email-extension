(() => {
  const OUTLOOK_URL = 'https://outlook.office.com/mail/';
  const el = Object.fromEntries([
    'saveStatus', 'sidePanelNote', 'openChromeSettingsBtn', 'inlineButton', 'inlineButtonHint', 'closeAfterInsert',
    'sortOrder', 'resetPopoverBtn', 'openDashboardBtn', 'openOutlookBtn', 'versionLine', 'toast'
  ].map((id) => [id, document.getElementById(id)]));
  const modeInputs = [...document.querySelectorAll('input[name="interfaceMode"]')];
  const INLINE_HINT = el.inlineButtonHint.textContent;
  let savedTimer = null;
  let toastTimer = null;

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 4500 : 2600);
  }

  function showSaved() {
    clearTimeout(savedTimer);
    el.saveStatus.hidden = false;
    savedTimer = setTimeout(() => { el.saveStatus.hidden = true; }, 1600);
  }

  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || 'Settings could not be saved. Reload this page and try again.');
    return response.result;
  }

  function render(preferences) {
    for (const input of modeInputs) input.checked = input.value === preferences.interfaceMode;
    const inlineMode = preferences.interfaceMode === 'inline';
    el.sidePanelNote.hidden = preferences.interfaceMode !== 'sidepanel';
    // Inline mode has no other way in, so the button stays on.
    el.inlineButton.checked = inlineMode || preferences.inlineButton;
    el.inlineButton.disabled = inlineMode;
    el.inlineButton.closest('label').classList.toggle('is-locked', inlineMode);
    el.inlineButtonHint.textContent = inlineMode ? 'Always on while Inline Editor is selected.' : INLINE_HINT;
    el.closeAfterInsert.checked = preferences.closeAfterInsert;
    el.closeAfterInsert.disabled = preferences.interfaceMode !== 'popover';
    el.closeAfterInsert.closest('label').classList.toggle('is-locked', preferences.interfaceMode !== 'popover');
    el.sortOrder.value = preferences.sortOrder;
  }

  async function save(patch) {
    try {
      render(await request({ type: 'ETM_PREFERENCES_SET', preferences: patch }));
      showSaved();
    } catch (error) {
      showToast(error.message, true);
      render(await request({ type: 'ETM_PREFERENCES_GET' }).catch(() => ({ interfaceMode: 'popover', inlineButton: true, closeAfterInsert: false, sortOrder: 'name' })));
    }
  }

  for (const input of modeInputs) {
    input.addEventListener('change', () => { if (input.checked) save({ interfaceMode: input.value }); });
  }
  el.inlineButton.addEventListener('change', () => save({ inlineButton: el.inlineButton.checked }));
  el.closeAfterInsert.addEventListener('change', () => save({ closeAfterInsert: el.closeAfterInsert.checked }));
  el.sortOrder.addEventListener('change', () => save({ sortOrder: el.sortOrder.value }));

  el.resetPopoverBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'ETM_FLOAT_STATE_RESET' });
      showToast('Refresh Outlook and the popover opens in its starting position.');
    } catch (error) {
      showToast(error.message, true);
    }
  });
  el.openChromeSettingsBtn.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://settings/appearance' }));
  el.openOutlookBtn.addEventListener('click', () => chrome.tabs.create({ url: OUTLOOK_URL }));
  el.openDashboardBtn.addEventListener('click', () => {
    const base = String(globalThis.MAIL_TEMPLATE_VAULT_CONFIG?.accountPortalUrl || '').replace(/\/$/, '');
    if (base) chrome.tabs.create({ url: `${base}/dashboard` });
    else showToast('The web dashboard address is not configured.', true);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ETM_PREFERENCES_CHANGED' && message.preferences) render(message.preferences);
  });

  const manifest = chrome.runtime.getManifest?.();
  if (manifest) el.versionLine.textContent = `${manifest.name}, version ${manifest.version}`;
  request({ type: 'ETM_PREFERENCES_GET' }).then(render).catch((error) => showToast(error.message, true));
})();
