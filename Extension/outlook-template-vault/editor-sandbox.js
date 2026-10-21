(() => {
  const CHANNEL = 'MAIL_TEMPLATE_VAULT_EDITOR';
  const JODIT_VERSION = '4.15.1';
  const SESSION = new URLSearchParams(location.search).get('session');

  const state = {
    editor: null,
    ready: false,
    suppressChanges: 0
  };

  const FONT_SIZES_PT = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];


  function installSandboxStyleProbe(editor) {
    // Jodit 4.15.1 otherwise creates a nested iframe for native-style measurements.
    // An opaque extension sandbox cannot read that iframe's document.
    const dataBind = window.Jodit.modules?.Helpers?.dataBind;
    if (typeof dataBind !== 'function') throw new Error('The bundled editor style helper is unavailable.');
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
    const probe = host.attachShadow({ mode: 'closed' });
    dataBind(editor, 'shadowRoot', probe);
    editor.e.on('beforeDestruct', () => host.remove());
  }

  const textarea = document.getElementById('sandboxEditor');
  const status = document.getElementById('sandboxStatus');

  function send(type, payload = {}) {
    window.parent.postMessage({ channel: CHANNEL, direction: 'sandbox-to-parent', session: SESSION, type, ...payload }, '*');
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
    status.hidden = false;
  }

  function attachPasteSanitizer(editor) {
    if (!editor || typeof TemplateSanitizer === 'undefined') return;

    // Intercept before Jodit's native paste bridge; editor elements can be replaced during initialization.
    window.addEventListener('paste', (event) => {
      if (!editor.editor?.contains(event.target)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const richHtml = clipboard.getData('text/html');
      const plainText = clipboard.getData('text/plain');
      if (!richHtml && !plainText) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        const cleanHtml = richHtml
          ? TemplateSanitizer.sanitizePaste(richHtml)
          : TemplateSanitizer.prepareForEditor(TemplateSanitizer.textToHtml(plainText));
        editor.s.focus();
        editor.s.insertHTML(cleanHtml, true);
        editor.synchronizeValues?.();
        send('TOAST', { message: 'Pasted with source formatting' });
      } catch (error) {
        send('TOAST', { message: error.message || 'Could not paste this content.', error: true });
      }
    }, true);

    window.addEventListener('drop', (event) => {
      if (!editor.editor?.contains(event.target)) return;
      const data = event.dataTransfer;
      if (!data) return;
      const richHtml = data.getData('text/html');
      const plainText = data.getData('text/plain');
      if (!richHtml && !plainText) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      editor.s.insertCursorAtPoint?.(event.clientX, event.clientY);

      try {
        const cleanHtml = richHtml
          ? TemplateSanitizer.sanitizePaste(richHtml)
          : TemplateSanitizer.prepareForEditor(TemplateSanitizer.textToHtml(plainText));
        editor.s.focus();
        editor.s.insertHTML(cleanHtml, true);
        editor.synchronizeValues?.();
        send('TOAST', { message: 'Dropped with source formatting' });
      } catch (error) {
        send('TOAST', { message: error.message || 'Could not drop this content.', error: true });
      }
    }, true);
  }

  function createEditor() {
    const defaults = document.createElement('style');
    defaults.textContent = TemplateSanitizer.editorDefaultsCss('.jodit-wysiwyg');
    document.head.appendChild(defaults);
    const fontList = {
      'Aptos, "Segoe UI", Arial, Helvetica, sans-serif': 'Aptos',
      'Arial, Helvetica, sans-serif': 'Arial',
      'Calibri, Arial, sans-serif': 'Calibri',
      '"Segoe UI", Arial, sans-serif': 'Segoe UI',
      'Georgia, serif': 'Georgia',
      '"Times New Roman", Times, serif': 'Times New Roman',
      'Verdana, Geneva, sans-serif': 'Verdana',
      '"Trebuchet MS", Helvetica, sans-serif': 'Trebuchet MS'
    };

    state.editor = window.Jodit.make(textarea, {
      height: 500,
      minHeight: 300,
      maxHeight: 500,
      width: '100%',
      toolbarAdaptive: false,
      toolbarSticky: true,
      toolbarButtonSize: 'middle',
      saveSelectionOnBlur: true,
      sourceEditor: 'area',
      beautifyHTML: false,
      spellcheck: true,
      enter: 'p',
      defaultFontSizePoints: 'pt',
      defaultLineHeight: Number(TemplateSanitizer.editorStyle().lineHeight),
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      processPasteHTML: false,
      processPasteFromWord: false,
      placeholder: 'Write your reusable email here…',
      buttons: [
        'undo', 'redo', '|',
        'paragraph', 'font', 'fontsize', 'brush', '|',
        'bold', 'italic', 'underline', 'strikethrough', '|',
        'ul', 'ol', 'outdent', 'indent', '|',
        'left', 'center', 'right', 'justify', '|',
        'link', 'unlink', 'table', 'hr', 'image', '|',
        'lineHeight', 'eraser', '|',
        'source', 'fullsize'
      ],
      buttonsMD: [
        'undo', 'redo', '|',
        'paragraph', 'font', 'fontsize', 'brush', '|',
        'bold', 'italic', 'underline', 'strikethrough', '|',
        'ul', 'ol', 'outdent', 'indent', '|',
        'left', 'center', 'right', 'justify', '|',
        'link', 'unlink', 'table', 'hr', 'image', '|',
        'lineHeight', 'eraser', '|',
        'source', 'fullsize'
      ],
      buttonsSM: [
        'undo', 'redo', 'bold', 'italic', 'underline',
        'font', 'fontsize', 'brush', 'paragraph',
        'ul', 'ol', 'link', 'table', 'lineHeight', 'source', 'fullsize', 'dots'
      ],
      controls: {
        font: { list: fontList },
        fontsize: {
          list: window.Jodit.atom ? window.Jodit.atom(FONT_SIZES_PT) : FONT_SIZES_PT.slice()
        },
        lineHeight: {
          list: window.Jodit.atom ? window.Jodit.atom([1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2]) : [1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2]
        }
      },
      style: TemplateSanitizer.editorStyle(),
      iframe: false,
      uploader: { insertImageAsBase64URI: false },
      filebrowser: false,
      showCharsCounter: true,
      showWordsCounter: true,
      showXPathInStatusbar: false
    });

    installSandboxStyleProbe(state.editor);
    attachPasteSanitizer(state.editor);

    state.editor.e?.on('change', () => {
      if (state.suppressChanges > 0) return;
      send('CHANGE', { html: getEditorHtml() });
    });
    // Jodit debounces source-to-rich synchronization. Track source typing immediately.
    state.editor.container.addEventListener('input', (event) => {
      if (state.suppressChanges === 0 && event.target.matches('.jodit-source textarea')) {
        send('CHANGE', { html: getEditorHtml() });
      }
    });

    state.ready = true;
    status.hidden = true;
    send('READY', { version: JODIT_VERSION });
  }

  function getEditorHtml() {
    if (!state.editor) return '';
    if (state.editor.getRealMode() === window.Jodit.MODE_SOURCE) {
      const source = state.editor.container.querySelector('.jodit-source textarea');
      if (source) return source.value;
    }
    return state.editor.value || '';
  }

  function setHtml(html, requestId, silent = false) {
    if (!state.editor) return;
    if (silent) state.suppressChanges += 1;
    try {
      const clean = TemplateSanitizer.prepareForEditor(html || '');
      state.editor.value = clean;
      state.editor.synchronizeValues?.();
      send('SET_DONE', { requestId, html: clean });
    } finally {
      if (silent) setTimeout(() => { state.suppressChanges = Math.max(0, state.suppressChanges - 1); }, 0);
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.channel !== CHANNEL || data.direction !== 'parent-to-sandbox' || data.session !== SESSION) return;

    switch (data.type) {
      case 'SET_HTML':
        if (state.ready) setHtml(data.html, data.requestId, Boolean(data.silent));
        break;
      case 'GET_HTML':
        send('HTML', { requestId: data.requestId, html: getEditorHtml() });
        break;
      case 'FOCUS':
        state.editor?.s?.focus?.();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopImmediatePropagation();
      send('SAVE_REQUEST');
    }
  }, true);

  (() => {
    setStatus('Loading Jodit editor…');
    if (!window.Jodit || typeof window.Jodit.make !== 'function') {
      setStatus('The bundled editor could not be loaded. Reload the extension and try again.', true);
      send('ERROR', { message: 'The bundled editor could not be loaded.' });
      return;
    }

    try {
      createEditor();
    } catch (error) {
      console.error(error);
      setStatus('The editor could not be initialized.', true);
      send('ERROR', { message: 'The Jodit editor could not be initialized.' });
    }
  })();
})();
