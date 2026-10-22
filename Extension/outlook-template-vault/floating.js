(() => {
  let host;
  let box;
  let bubble;
  let frame;
  let minimized = false;
  let geometry = { left: 8, top: 60, width: 310, height: 680 };

  async function runtime(message) {
    const response = await chrome.runtime.sendMessage(message);
    return response?.ok ? response.result : null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function captureGeometry() {
    if (!box || box.hidden) return;
    const rect = box.getBoundingClientRect();
    geometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function save() {
    captureGeometry();
    runtime({ type: 'ETM_FLOAT_STATE_SET', state: { ...geometry, minimized } });
  }

  function applyMinimizedState() {
    box.hidden = minimized;
    bubble.hidden = !minimized;
    if (!minimized) frame.focus();
  }

  function minimize() {
    captureGeometry();
    minimized = true;
    applyMinimizedState();
    save();
  }

  function restore() {
    minimized = false;
    applyMinimizedState();
    save();
  }

  async function create() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'mail-template-vault-window';
    host.hidden = true;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147482999;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}[hidden]{display:none!important}
        .window{position:fixed;left:calc(100vw - 340px);top:72px;width:310px;height:min(680px,calc(100vh - 100px));min-width:310px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;overflow:hidden;resize:both;border:1px solid #cdd8d2;border-radius:15px;background:#fff;box-shadow:0 22px 60px rgba(15,35,29,.24);pointer-events:auto}
        .bar{height:42px;flex:none;display:flex;align-items:center;gap:8px;padding:0 8px 0 13px;color:#fff;background:#173b32;cursor:move;user-select:none}
        .title{flex:1;font:700 13px system-ui}
        .bar button{width:28px;height:28px;border:0;border-radius:7px;color:#fff;background:rgba(255,255,255,.12);font:700 16px system-ui;cursor:pointer}
        .bar button:hover{background:rgba(255,255,255,.22)}
        iframe{width:100%;height:100%;flex:1;border:0;background:#f8faf9}
        .bubble{position:fixed;right:22px;bottom:22px;width:58px;height:58px;padding:0;display:grid;place-items:center;color:#fff;background:#173b32;border:2px solid rgba(255,255,255,.9);border-radius:50%;box-shadow:0 12px 30px rgba(15,35,29,.34);pointer-events:auto;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
        .bubble:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 16px 34px rgba(15,35,29,.34)}
        .bubble:focus-visible{outline:3px solid #fff;outline-offset:3px}
        .bubble svg{width:27px;height:27px;stroke:currentColor;stroke-width:2.2;fill:none;stroke-linecap:round;stroke-linejoin:round}
        @media(max-width:600px){.window{left:8px;top:58px;width:calc(100vw - 16px);height:calc(100vh - 74px)}.bubble{right:16px;bottom:16px}}
        @media(prefers-reduced-motion:reduce){.bubble{transition:none}}
      </style>
      <section class="window" role="dialog" aria-label="Mail Template Vault">
        <header class="bar">
          <span class="title">Mail Template Vault</span>
          <button class="minimize" title="Minimize" aria-label="Minimize to floating button">—</button>
          <button class="close" title="Close" aria-label="Close">×</button>
        </header>
        <iframe title="Mail Template Vault"></iframe>
      </section>
      <button class="bubble" type="button" title="Open Mail Template Vault" aria-label="Restore Mail Template Vault" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>
      </button>`;

    box = shadow.querySelector('.window');
    bubble = shadow.querySelector('.bubble');
    frame = shadow.querySelector('iframe');
    frame.src = chrome.runtime.getURL('sidepanel.html?floating=1');
    shadow.querySelector('.close').onclick = () => { host.hidden = true; save(); };
    shadow.querySelector('.minimize').onclick = minimize;
    bubble.onclick = restore;

    let drag = null;
    const bar = shadow.querySelector('.bar');
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const rect = box.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag) return;
      box.style.left = `${clamp(event.clientX - drag.x, 8, innerWidth - box.offsetWidth - 8)}px`;
      box.style.top = `${clamp(event.clientY - drag.y, 8, innerHeight - box.offsetHeight - 8)}px`;
    });
    bar.addEventListener('pointerup', () => { drag = null; save(); });
    box.addEventListener('mouseup', save);
    document.documentElement.appendChild(host);

    const state = await runtime({ type: 'ETM_FLOAT_STATE_GET' });
    if (state) {
      geometry = {
        left: clamp(Number(state.left) || 8, 8, innerWidth - 318),
        top: clamp(Number(state.top) || 60, 8, innerHeight - 268),
        width: 310,
        height: clamp(Number(state.height) || 680, 260, innerHeight - 16)
      };
      minimized = Boolean(state.minimized);
    }
    box.style.left = `${geometry.left}px`;
    box.style.top = `${geometry.top}px`;
    box.style.width = `${geometry.width}px`;
    box.style.height = `${geometry.height}px`;
    applyMinimizedState();
  }

  async function toggle() {
    const existed = Boolean(host);
    await create();
    host.hidden = existed ? !host.hidden : false;
    if (!host.hidden) applyMinimizedState();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id === chrome.runtime.id && message?.type === 'ETM_TOGGLE_VAULT') {
      toggle().then(() => sendResponse({ ok: true }));
      return true;
    }
  });
})();
