(() => {
  if (globalThis.__MAIL_TEMPLATE_VAULT_FLOATING_INITIALIZED__) return;
  globalThis.__MAIL_TEMPLATE_VAULT_FLOATING_INITIALIZED__ = true;
  const MIN_WIDTH = 330;
  const MIN_HEIGHT = 320;
  const DEFAULT_WIDTH = 380;
  let host;
  let box;
  let bubble;
  let frame;
  let minimized = false;
  let geometry = null;
  let saveTimer = null;

  async function runtime(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response?.ok ? response.result : null;
    } catch (_) {
      // The extension was reloaded and this page still runs the old script.
      return null;
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function captureGeometry() {
    if (!box || box.hidden || host.hidden) return;
    const rect = box.getBoundingClientRect();
    if (rect.width && rect.height) geometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function save() {
    captureGeometry();
    if (geometry) runtime({ type: 'ETM_FLOAT_STATE_SET', state: { ...geometry, minimized } });
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  function defaultGeometry() {
    const height = clamp(680, MIN_HEIGHT, innerHeight - 96);
    return { left: Math.max(8, innerWidth - DEFAULT_WIDTH - 24), top: 72, width: DEFAULT_WIDTH, height };
  }

  function fitGeometry(value) {
    const width = clamp(Number(value.width) || DEFAULT_WIDTH, MIN_WIDTH, innerWidth - 16);
    const height = clamp(Number(value.height) || 680, MIN_HEIGHT, innerHeight - 16);
    return {
      width,
      height,
      left: clamp(Number(value.left) || 8, 8, innerWidth - width - 8),
      top: clamp(Number(value.top) || 8, 8, innerHeight - height - 8)
    };
  }

  function applyGeometry() {
    geometry = fitGeometry(geometry || defaultGeometry());
    box.style.left = `${geometry.left}px`;
    box.style.top = `${geometry.top}px`;
    box.style.width = `${geometry.width}px`;
    box.style.height = `${geometry.height}px`;
  }

  function applyMinimizedState() {
    box.hidden = minimized;
    bubble.hidden = !minimized;
    if (minimized) return;
    // The list only loads when the window is first shown, not on every Outlook page load.
    if (!frame.src) frame.src = chrome.runtime.getURL('sidepanel.html?floating=1');
    frame.focus();
  }

  function keepInsideViewport() {
    if (!box || box.hidden || host.hidden) return;
    captureGeometry();
    applyGeometry();
    save();
  }

  function minimize() {
    captureGeometry();
    minimized = true;
    applyMinimizedState();
    save();
  }

  function restore() {
    minimized = false;
    applyGeometry();
    applyMinimizedState();
    save();
  }

  function setFrameInteractive(interactive) {
    // A pointer over the iframe would otherwise stop reaching this page mid-drag.
    frame.style.pointerEvents = interactive ? '' : 'none';
  }

  async function create() {
    if (host) return;
    document.getElementById('mail-template-vault-window')?.remove();
    host = document.createElement('div');
    host.id = 'mail-template-vault-window';
    host.hidden = true;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147482999;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}[hidden]{display:none!important}
        .window{position:fixed;min-width:${MIN_WIDTH}px;min-height:${MIN_HEIGHT}px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;overflow:hidden;resize:both;border:1px solid rgba(17,24,39,.08);border-radius:20px;background:#f7f8fa;box-shadow:0 24px 64px rgba(10,18,32,.24),0 2px 8px rgba(10,18,32,.08);pointer-events:auto;animation:pop .18s cubic-bezier(.2,.8,.2,1)}
        @keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
        .bar{height:30px;flex:none;display:flex;align-items:center;justify-content:flex-end;gap:2px;padding:4px 8px 0;background:#f7f8fa;cursor:move;user-select:none;touch-action:none;position:relative}
        .grip{position:absolute;left:50%;top:9px;width:36px;height:4px;margin-left:-18px;border-radius:4px;background:#d5d9e0}
        .bar button{width:26px;height:26px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;color:#5b6472;background:transparent;cursor:pointer;transition:background .15s,color .15s}
        .bar button:hover{color:#111827;background:#e8eaee}
        .bar button:focus-visible,.bubble:focus-visible{outline:2px solid #2f80ed;outline-offset:2px}
        .bar svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
        iframe{width:100%;height:100%;flex:1;min-height:0;border:0;background:#f7f8fa}
        .bubble{position:fixed;right:22px;bottom:22px;width:54px;height:54px;padding:0;display:grid;place-items:center;color:#fff;background:#17181c;border:0;border-radius:50%;box-shadow:0 12px 28px rgba(10,18,32,.34);pointer-events:auto;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease;animation:pop .18s cubic-bezier(.2,.8,.2,1)}
        .bubble:hover{transform:scale(1.06);box-shadow:0 16px 34px rgba(10,18,32,.38)}
        .bubble svg{width:24px;height:24px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
        @media(max-width:600px){.bubble{right:16px;bottom:16px}}
        @media(prefers-reduced-motion:reduce){.bubble,.window{transition:none;animation:none}}
      </style>
      <section class="window" role="dialog" aria-label="Mail Template Vault">
        <header class="bar">
          <span class="grip" aria-hidden="true"></span>
          <button class="minimize" type="button" title="Minimize" aria-label="Minimize to floating button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg></button>
          <button class="close" type="button" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></button>
        </header>
        <iframe title="Mail Template Vault" allow="clipboard-write"></iframe>
      </section>
      <button class="bubble" type="button" title="Open Mail Template Vault" aria-label="Restore Mail Template Vault" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>
      </button>`;

    box = shadow.querySelector('.window');
    bubble = shadow.querySelector('.bubble');
    frame = shadow.querySelector('iframe');
    shadow.querySelector('.close').onclick = () => { save(); host.hidden = true; };
    shadow.querySelector('.minimize').onclick = minimize;
    bubble.onclick = restore;

    let drag = null;
    const bar = shadow.querySelector('.bar');
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      setFrameInteractive(true);
      save();
    };
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const rect = box.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setFrameInteractive(false);
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag) return;
      box.style.left = `${clamp(event.clientX - drag.x, 8, innerWidth - box.offsetWidth - 8)}px`;
      box.style.top = `${clamp(event.clientY - drag.y, 8, innerHeight - box.offsetHeight - 8)}px`;
    });
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    // mouseup never reaches this page when a resize ends over the iframe.
    new ResizeObserver(saveSoon).observe(box);
    window.addEventListener('resize', keepInsideViewport);
    document.documentElement.appendChild(host);

    const state = await runtime({ type: 'ETM_FLOAT_STATE_GET' });
    if (state) {
      geometry = fitGeometry(state);
      minimized = Boolean(state.minimized);
    }
    applyGeometry();
  }

  async function toggle() {
    const existed = Boolean(host);
    await create();
    if (existed && !host.hidden && minimized) {
      restore();
      return;
    }
    host.hidden = existed ? !host.hidden : false;
    if (!host.hidden) {
      // Opening from the toolbar always shows the full window, not the bubble.
      minimized = false;
      applyGeometry();
      applyMinimizedState();
    }
  }

  async function closeAfterInsert() {
    if (!host || host.hidden) return;
    save();
    host.hidden = true;
  }

  async function restoreBubbleOnLoad() {
    const [preferences, state] = await Promise.all([
      runtime({ type: 'ETM_PREFERENCES_GET' }),
      runtime({ type: 'ETM_FLOAT_STATE_GET' })
    ]);
    if (preferences?.interfaceMode !== 'popover' || !state?.minimized) return;
    await create();
    minimized = true;
    host.hidden = false;
    applyMinimizedState();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'ETM_TOGGLE_VAULT') {
      toggle().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === 'ETM_CLOSE_VAULT') {
      closeAfterInsert().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === 'ETM_PREFERENCES_CHANGED' && host && message.preferences?.interfaceMode !== 'popover') {
      host.hidden = true;
    }
  });

  restoreBubbleOnLoad();
})();
