const TemplateSanitizer = (() => {
  const DROP_TAGS = new Set([
    'script', 'style', 'meta', 'link', 'iframe', 'object', 'embed', 'form', 'input',
    'button', 'select', 'option', 'textarea', 'canvas', 'svg', 'video', 'audio',
    'source', 'track', 'noscript', 'template'
  ]);

  const ALLOWED_TAGS = new Set([
    'p', 'div', 'span', 'br', 'strong', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
    'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody',
    'tfoot', 'tr', 'td', 'th', 'sub', 'sup', 'code', 'pre'
  ]);

  const BLOCK_TAGS = new Set([
    'p', 'div', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'pre'
  ]);

  const TOP_LEVEL_BLOCK_TAGS = new Set([
    'p', 'div', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'pre', 'hr'
  ]);

  const VOID_TAGS = new Set(['br', 'img', 'hr']);
  const INLINE_VISUAL_TAGS = new Set(['span', 'strong', 'em', 'u', 's', 'a', 'code', 'sub', 'sup']);
  const EMAIL_FONT = "Aptos, \"Segoe UI\", Arial, Helvetica, sans-serif";
  const EMAIL_TEXT_COLOR = '#242424';
  const EMAIL_LINK_COLOR = '#0563c1';

  const ROOT_STYLE = { 'font-family': EMAIL_FONT, 'font-size': '12pt', 'line-height': '1.5', color: EMAIL_TEXT_COLOR };
  const margins = (bottom = '0') => ({ 'margin-top': '0', 'margin-right': '0', 'margin-bottom': bottom, 'margin-left': '0' });
  // This single set of defaults is used by Jodit's canvas and serialized email HTML.
  const EMAIL_RULES = {
    p: margins('14px'),
    div: {},
    ul: { ...margins('14px'), 'padding-left': '26px', 'list-style-type': 'disc', 'list-style-position': 'outside' },
    ol: { ...margins('14px'), 'padding-left': '26px', 'list-style-type': 'decimal', 'list-style-position': 'outside' },
    li: margins(),
    h1: { ...margins('10px'), 'font-size': '20pt', 'line-height': '26pt', 'font-weight': '700' },
    h2: { ...margins('10px'), 'font-size': '18pt', 'line-height': '24pt', 'font-weight': '700' },
    h3: { ...margins('10px'), 'font-size': '16pt', 'line-height': '22pt', 'font-weight': '700' },
    h4: { ...margins('10px'), 'font-size': '14pt', 'line-height': '20pt', 'font-weight': '700' },
    h5: { ...margins('10px'), 'font-size': '12pt', 'line-height': '18pt', 'font-weight': '700' },
    h6: { ...margins('10px'), 'font-size': '10pt', 'line-height': '16pt', 'font-weight': '700' },
    blockquote: { ...margins('14px'), 'padding-left': '14px', 'border-left': '3px solid #d9d9d9' },
    a: { color: EMAIL_LINK_COLOR, 'text-decoration-line': 'underline' },
    strong: { 'font-weight': '700' }, em: { 'font-style': 'italic' },
    u: { 'text-decoration-line': 'underline' }, s: { 'text-decoration-line': 'line-through' },
    img: { 'max-width': '100%', border: '0' },
    table: { 'border-collapse': 'collapse', 'border-spacing': '0' },
    td: { 'vertical-align': 'top' }, th: { 'vertical-align': 'top', 'font-weight': '700', 'text-align': 'center' },
    hr: { border: '0', 'border-top': '1px solid #d9d9d9', ...margins('14px'), 'margin-top': '14px' },
    pre: { ...margins('16px'), 'font-family': 'Consolas, Monaco, monospace', 'white-space': 'pre-wrap' },
    code: { 'font-family': 'Consolas, Monaco, monospace' }
  };

  function editorDefaultsCss(selector) {
    const css = (styles) => Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';');
    return `${selector}{${css(ROOT_STYLE)}}` + Object.entries(EMAIL_RULES)
      .map(([tag, styles]) => `${selector} ${tag}{${css(styles)}}`).join('');
  }

  function editorStyle() {
    return { fontFamily: ROOT_STYLE['font-family'], fontSize: ROOT_STYLE['font-size'],
      lineHeight: ROOT_STYLE['line-height'], color: ROOT_STYLE.color, backgroundColor: '#ffffff' };
  }

  function isSafeUrl(value, type = 'link') {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;

    if (type === 'image' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed)) {
      return true;
    }

    try {
      const url = new URL(trimmed, 'https://template.invalid/');
      if (type === 'image') return ['http:', 'https:'].includes(url.protocol);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
    } catch (_) {
      return false;
    }
  }


  function appendCleanChildren(source, destination, doc, options = {}) {
    for (const child of [...source.childNodes]) {
      const clean = cleanNode(child, doc, options);
      if (clean) destination.appendChild(clean);
    }
  }

  function normalizedColor(doc, value, property) {
    if (!value || /(?:var|env|url)\s*\(/i.test(value)) return '';
    const probe = doc.createElement('span');
    try {
      probe.style[property] = value;
      return probe.style[property] || '';
    } catch (_) {
      return '';
    }
  }

  function collectSafeVisualStyle(source, destination, tag, doc, options = {}) {
    const styleParts = [];
    const sourceStyle = source.style || {};

    const rawColor = sourceStyle.color || source.getAttribute?.('color') || '';
    const color = normalizedColor(doc, rawColor, 'color');
    if (color) styleParts.push(`color:${color}`);

    let rawBackground = sourceStyle.backgroundColor || '';
    if (!rawBackground && source.getAttribute?.('bgcolor')) rawBackground = source.getAttribute('bgcolor');
    const background = normalizedColor(doc, rawBackground, 'backgroundColor');
    const preserveBackground = INLINE_VISUAL_TAGS.has(tag) || BLOCK_TAGS.has(tag);
    if (background && preserveBackground) {
      styleParts.push(`background-color:${background}`);
    }

    {
      const fontFamily = String(sourceStyle.fontFamily || source.getAttribute?.('face') || '').trim();
      if (fontFamily && fontFamily.length <= 300 && /^[\p{L}\p{N}\s,'"_-]+$/u.test(fontFamily)) {
        styleParts.push(`font-family:${fontFamily}`);
      }

      const legacySize = Number(source.getAttribute?.('size'));
      const fontSize = String(sourceStyle.fontSize || ([1, 2, 3, 4, 5, 6, 7].includes(legacySize)
        ? `${[0, 10, 13, 16, 18, 24, 32, 48][legacySize]}px` : '')).trim().toLowerCase();
      if (/^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem|%)$/.test(fontSize)) {
        const n = parseFloat(fontSize);
        if ((fontSize.endsWith('pt') && n >= 1 && n <= 96) || (fontSize.endsWith('px') && n >= 1 && n <= 128) ||
            (fontSize.endsWith('em') && n >= 0.1 && n <= 8) || (fontSize.endsWith('%') && n >= 10 && n <= 800)) {
          styleParts.push(`font-size:${fontSize}`);
        }
      }

      const lineHeight = String(sourceStyle.lineHeight || '').trim().toLowerCase();
      if (lineHeight === 'normal') styleParts.push('line-height:normal');
      if (/^(?:\d{1,3}(?:\.\d+)?(?:px|pt|%|em)|(?:\d+(?:\.\d+)?))$/.test(lineHeight)) {
        const n = parseFloat(lineHeight);
        if ((lineHeight.endsWith('px') && n >= 1 && n <= 192) ||
            (lineHeight.endsWith('pt') && n >= 1 && n <= 144) ||
            (lineHeight.endsWith('%') && n >= 50 && n <= 400) ||
            ((lineHeight.endsWith('em') || /^[\d.]+$/.test(lineHeight)) && n >= 0.5 && n <= 4)) {
          styleParts.push(`line-height:${lineHeight}`);
        }
      }
      if (/^(?:normal|bold|[1-9]00)$/.test(sourceStyle.fontWeight)) styleParts.push(`font-weight:${sourceStyle.fontWeight}`);
      if (['normal', 'italic', 'oblique'].includes(sourceStyle.fontStyle)) styleParts.push(`font-style:${sourceStyle.fontStyle}`);
      const decoration = sourceStyle.textDecorationLine;
      if (/^(?:none|underline|line-through|overline)(?: (?:underline|line-through|overline))*$/.test(decoration)) {
        styleParts.push(`text-decoration-line:${decoration}`);
      }
      if (['normal', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'].includes(sourceStyle.whiteSpace)) {
        styleParts.push(`white-space:${sourceStyle.whiteSpace}`);
      }
    }

    if (BLOCK_TAGS.has(tag)) {
      const align = String(sourceStyle.textAlign || source.getAttribute('align') || '').toLowerCase();
      if (['left', 'right', 'center', 'justify'].includes(align)) styleParts.push(`text-align:${align}`);
      {
        for (const prop of ['margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'text-indent']) {
          const value = String(sourceStyle.getPropertyValue(prop) || '').trim().toLowerCase();
          if (/^-?\d{1,3}(?:\.\d+)?(?:px|pt|em|in|cm|mm|%)$/.test(value)) {
            const n = parseFloat(value);
            if (Math.abs(n) <= 200 && (n >= 0 || prop === 'text-indent')) styleParts.push(`${prop}:${value}`);
          }
        }
      }
    }

    if (['ul', 'ol', 'li'].includes(tag)) {
      const type = sourceStyle.listStyleType || ({ a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman', '1': 'decimal' })[source.getAttribute('type')];
      if (['disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'none'].includes(type)) {
        styleParts.push(`list-style-type:${type}`);
      }
      if (['inside', 'outside'].includes(sourceStyle.listStylePosition)) styleParts.push(`list-style-position:${sourceStyle.listStylePosition}`);
    }

    if (BLOCK_TAGS.has(tag) || ['img', 'hr'].includes(tag)) {
      for (const prop of ['width', 'height']) {
        const value = sourceStyle.getPropertyValue(prop);
        if (/^\d{1,4}(?:\.\d+)?(?:px|pt|%)$/.test(value) &&
            parseFloat(value) <= (value.endsWith('%') ? 100 : 2000)) styleParts.push(`${prop}:${value}`);
      }
      if (tag !== 'img') {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const padding = sourceStyle.getPropertyValue(`padding-${side}`);
          if (/^\d{1,2}(?:\.\d+)?(?:px|pt)$/.test(padding) && parseFloat(padding) <= 80) {
            styleParts.push(`padding-${side}:${padding}`);
          }
          const width = sourceStyle.getPropertyValue(`border-${side}-width`);
          const style = sourceStyle.getPropertyValue(`border-${side}-style`);
          const color = normalizedColor(doc, sourceStyle.getPropertyValue(`border-${side}-color`), 'color');
          if (/^\d(?:\.\d+)?(?:px|pt)$/.test(width) && ['solid', 'dashed', 'dotted', 'double', 'none'].includes(style)) {
            styleParts.push(`border-${side}:${width} ${style} ${color || '#d9d9d9'}`);
          }
        }
        const spacing = sourceStyle.borderSpacing;
        if (/^\d{1,2}(?:px|pt)(?: \d{1,2}(?:px|pt))?$/.test(spacing)) styleParts.push(`border-spacing:${spacing}`);
        if (['collapse', 'separate'].includes(sourceStyle.borderCollapse)) {
          styleParts.push(`border-collapse:${sourceStyle.borderCollapse}`);
        }
        if (['top', 'middle', 'bottom'].includes(sourceStyle.verticalAlign)) {
          styleParts.push(`vertical-align:${sourceStyle.verticalAlign}`);
        }
      }
    }

    if (styleParts.length) destination.setAttribute('style', styleParts.join(';'));

    const dir = String(source.getAttribute?.('dir') || '').toLowerCase();
    if (['ltr', 'rtl', 'auto'].includes(dir)) destination.setAttribute('dir', dir);

    const lang = String(source.getAttribute?.('lang') || '').trim();
    if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(lang)) destination.setAttribute('lang', lang);
  }

  function copyAllowedAttributes(source, destination, tag, doc, options = {}) {
    if (tag === 'a') {
      const href = source.getAttribute('href');
      if (isSafeUrl(href, 'link')) destination.setAttribute('href', href.trim());
      const title = source.getAttribute('title');
      if (title) destination.setAttribute('title', title.slice(0, 500));
      destination.setAttribute('target', '_blank');
      destination.setAttribute('rel', 'noopener noreferrer');
      collectSafeVisualStyle(source, destination, tag, doc, options);
      return;
    }

    if (tag === 'img') {
      const src = source.getAttribute('src');
      if (!isSafeUrl(src, 'image')) return;
      destination.setAttribute('src', src.trim());

      const alt = source.getAttribute('alt');
      const title = source.getAttribute('title');
      if (alt) destination.setAttribute('alt', alt.slice(0, 1000));
      if (title) destination.setAttribute('title', title.slice(0, 500));

      for (const attr of ['width', 'height']) {
        const raw = source.getAttribute(attr);
        if (/^\d{1,4}$/.test(raw || '')) destination.setAttribute(attr, raw);
      }
      collectSafeVisualStyle(source, destination, tag, doc, options);
      return;
    }

    if (['table', 'td', 'th'].includes(tag)) {
      for (const attr of ['width', 'height', ...(tag === 'table' ? ['cellpadding', 'cellspacing', 'border'] : [])]) {
        const raw = source.getAttribute(attr);
        if (/^\d{1,4}$/.test(raw || '') && Number(raw) <= 2000) destination.setAttribute(attr, raw);
      }
    }

    if (tag === 'td' || tag === 'th') {
      for (const attr of ['colspan', 'rowspan']) {
        const raw = source.getAttribute(attr);
        if (/^\d{1,2}$/.test(raw || '')) destination.setAttribute(attr, raw);
      }
    }

    if (tag === 'ol') {
      const start = source.getAttribute('start');
      if (/^-?\d{1,4}$/.test(start || '')) destination.setAttribute('start', start);
    }

    collectSafeVisualStyle(source, destination, tag, doc, options);
  }

  function cleanNode(node, doc, options = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      return doc.createTextNode(node.nodeValue || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const sourceTag = node.tagName.toLowerCase();
    if (DROP_TAGS.has(sourceTag)) return null;

    if (node.style.display === 'none' || node.style.visibility === 'hidden') return null;

    const mappedTag = sourceTag === 'b' ? 'strong'
      : sourceTag === 'i' ? 'em'
        : sourceTag === 'strike' ? 's'
          : sourceTag === 'font' ? 'span'
            : sourceTag === 'mark' ? 'span'
              : sourceTag;

    if (!ALLOWED_TAGS.has(mappedTag)) {
      const fragment = doc.createDocumentFragment();
      appendCleanChildren(node, fragment, doc, options);
      const wrapper = doc.createElement([...node.children].some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase())) ? 'div' : 'span');
      collectSafeVisualStyle(node, wrapper, wrapper.tagName.toLowerCase(), doc, options);
      if (!wrapper.attributes.length) return fragment;
      wrapper.appendChild(fragment);
      return wrapper;
    }

    if (mappedTag === 'img') {
      const img = doc.createElement('img');
      copyAllowedAttributes(node, img, mappedTag, doc, options);
      return img.hasAttribute('src') ? img : null;
    }

    const clean = doc.createElement(mappedTag);
    copyAllowedAttributes(node, clean, mappedTag, doc, options);

    if (sourceTag === 'mark' && !clean.style.backgroundColor) {
      clean.style.backgroundColor = 'rgb(255, 255, 0)';
    }

    appendCleanChildren(node, clean, doc, options);

    if (VOID_TAGS.has(mappedTag)) return clean;

    return clean;
  }


  function unwrapRedundantSpans(root) {
    for (const span of [...root.querySelectorAll('span')].reverse()) {
      if (span.attributes.length !== 0) continue;
      span.replaceWith(...span.childNodes);
    }
  }


  function wrapTopLevelInlineRuns(root, doc) {
    let paragraph = null;

    for (const child of [...root.childNodes]) {
      const isWhitespaceText = child.nodeType === Node.TEXT_NODE && !(child.nodeValue || '').trim();
      if (isWhitespaceText) {
        if (paragraph) paragraph.appendChild(child);
        else child.remove();
        continue;
      }

      const isBlock = child.nodeType === Node.ELEMENT_NODE && TOP_LEVEL_BLOCK_TAGS.has(child.tagName.toLowerCase());
      if (isBlock) {
        paragraph = null;
        continue;
      }

      if (!paragraph) {
        paragraph = doc.createElement('p');
        root.insertBefore(paragraph, child);
      }
      paragraph.appendChild(child);
    }
  }

  function collapseSpacerBlocks(root) {
    for (const element of [...root.querySelectorAll('p,div')]) {
      const hasMeaningfulMedia = element.querySelector('img,hr,table,ul,ol');
      if (hasMeaningfulMedia) continue;

      const text = (element.textContent || '').replace(/\u00a0/g, ' ').trim();
      const onlyBreaks = [...element.childNodes].every((child) => {
        if (child.nodeType === Node.TEXT_NODE) return !(child.nodeValue || '').replace(/\u00a0/g, ' ').trim();
        return child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'br';
      });

      // Intentional blank paragraphs represent email spacing, including editor Enter presses.
      if (!text && onlyBreaks && !element.querySelector('br')) element.replaceChildren(root.ownerDocument.createElement('br'));
    }
  }

  function removeEmptyNoise(root) {
    const removable = 'strong,em,u,s,a,span,p,div,h1,h2,h3,h4,blockquote,li';
    for (const element of [...root.querySelectorAll(removable)].reverse()) {
      if (element.querySelector('img,br,hr,table,ul,ol')) continue;
      // A Word/Docs span may contain only the separator between two formatted runs.
      // Whitespace (including NBSP) is content here: trimming it joins words and links.
      if (element.textContent === '') element.remove();
    }
  }

  function inlineDocumentStyles(doc) {
    // Read document styles in a detached stylesheet. No pasted content is mounted or executed.
    const properties = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color',
      'background-color', 'text-decoration-line', 'text-align', 'text-indent', 'white-space',
      'list-style-type', 'list-style-position', 'border-collapse', 'border-spacing', 'vertical-align',
      'width', 'height', 'display', 'visibility',
      ...['top', 'right', 'bottom', 'left'].flatMap((side) =>
        [`margin-${side}`, `padding-${side}`, `border-${side}-width`, `border-${side}-style`, `border-${side}-color`])];
    const winners = new Map();
    let order = 0;
    let matches = 0;
    for (const style of doc.querySelectorAll('style')) {
      const sheet = new CSSStyleSheet();
      try { sheet.replaceSync(style.textContent); } catch (_) { continue; }
      for (const rule of sheet.cssRules) {
        if (!rule.selectorText || ++order > 2000) continue;
        for (const selector of rule.selectorText.split(',')) {
          // Word/Docs use basic class and element selectors. Exclude pseudo-classes and complex queries.
          if (selector.length > 256 || !/^[\w\s.#*>+~-]+$/.test(selector)) continue;
          const specificity = (selector.match(/#/g) || []).length * 1000000 +
            (selector.match(/\./g) || []).length * 1000 + (selector.match(/(?:^|[\s>+~])[a-z]/gi) || []).length;
          let elements;
          try { elements = doc.querySelectorAll(selector); } catch (_) { continue; }
          for (const element of elements) {
            if (++matches > 20000) throw new Error('Pasted document styles are too complex. Paste a smaller selection.');
            if (!winners.has(element)) {
              const initial = new Map();
              for (const prop of properties) {
                const value = element.style.getPropertyValue(prop);
                if (value) initial.set(prop, { value, important: element.style.getPropertyPriority(prop) === 'important', specificity: 1000000000, order: 0 });
              }
              winners.set(element, initial);
            }
            const styles = winners.get(element);
            for (const prop of properties) {
              const value = rule.style.getPropertyValue(prop);
              if (!value) continue;
              const important = rule.style.getPropertyPriority(prop) === 'important';
              const previous = styles.get(prop);
              if (!previous || (important && !previous.important) || (important === previous.important &&
                  (specificity > previous.specificity || (specificity === previous.specificity && order >= previous.order)))) {
                styles.set(prop, { value, important, specificity, order });
              }
            }
          }
        }
      }
    }
    for (const [element, styles] of winners) {
      for (const [prop, { value }] of styles) element.style.setProperty(prop, value);
    }
  }

  function sanitize(input, options = {}) {
    const html = String(input || '');
    if (!html.trim()) return '';

    const parser = new DOMParser();
    const sourceDoc = parser.parseFromString(html, 'text/html');
    inlineDocumentStyles(sourceDoc);
    const outputDoc = document.implementation.createHTMLDocument('');
    const container = outputDoc.createElement('div');

    // Keep explicit body/document typography when full document HTML is on the clipboard.
    let destination = container;
    for (const sourceRoot of [sourceDoc.documentElement, sourceDoc.body]) {
      const wrapper = outputDoc.createElement('div');
      collectSafeVisualStyle(sourceRoot, wrapper, 'div', outputDoc, options);
      if (wrapper.attributes.length) { destination.appendChild(wrapper); destination = wrapper; }
    }
    appendCleanChildren(sourceDoc.body, destination, outputDoc, options);
    wrapTopLevelInlineRuns(container, outputDoc);
    unwrapRedundantSpans(container);
    collapseSpacerBlocks(container);
    removeEmptyNoise(container);

    return container.innerHTML.trim();
  }

  function sanitizePaste(input) {
    return prepareForEditor(input);
  }

  function mergeInlineStyle(element, declarations, overwrite = false) {
    for (const [property, value] of Object.entries(declarations)) {
      if (!overwrite && element.style.getPropertyValue(property)) continue;
      element.style.setProperty(property, value);
    }
  }

  function applyCanonicalEmailStyles(root) {
    mergeInlineStyle(root, ROOT_STYLE);
    const resolved = new WeakMap();
    resolved.set(root, { ...ROOT_STYLE, 'font-weight': '400', 'font-style': 'normal' });
    const px = (value) => parseFloat(value) * (value.endsWith('pt') ? 4 / 3 : 1);
    const precision = (value) => Math.round(value * 10000) / 10000;

    // Walk in document order so every child gets its actual inherited typography.
    for (const element of root.querySelectorAll('*')) {
      const tag = element.tagName.toLowerCase();
      const inherited = resolved.get(element.parentElement) || resolved.get(root);
      const defaults = { ...(EMAIL_RULES[tag] || {}) };
      // Border shorthands must not erase a partially specified source border.
      for (const property of Object.keys(defaults)) {
        if (property.startsWith('border') && property !== 'border-collapse' && property !== 'border-spacing' &&
            [...element.style].some((name) => name.startsWith(property))) delete defaults[property];
      }
      mergeInlineStyle(element, defaults);
      const size = element.style.fontSize;
      if (size.endsWith('%') || size.endsWith('em')) {
        const base = size.endsWith('rem') ? 16 : px(inherited['font-size']);
        const scale = size.endsWith('%') ? 100 : 1;
        element.style.fontSize = `${precision(base * parseFloat(size) / scale)}px`;
      }
      const fontSize = element.style.fontSize || inherited['font-size'];
      const lineHeight = element.style.lineHeight;
      if (lineHeight.endsWith('%') || lineHeight.endsWith('em')) {
        element.style.lineHeight = `${precision(px(fontSize) * parseFloat(lineHeight) / (lineHeight.endsWith('%') ? 100 : 1))}px`;
      }
      if (BLOCK_TAGS.has(tag)) mergeInlineStyle(element, inherited);
      resolved.set(element, Object.fromEntries(Object.keys(inherited).map((property) =>
        [property, element.style.getPropertyValue(property) || inherited[property]])));
      if (tag === 'table') {
        for (const attr of ['cellpadding', 'cellspacing', 'border']) {
          if (!element.hasAttribute(attr)) element.setAttribute(attr, '0');
        }
      }
    }
  }

  function prepareForEditor(input) {
    const clean = sanitize(input);
    if (!clean) return '';
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    applyCanonicalEmailStyles(doc.body);
    return doc.body.innerHTML;
  }

  function toEmailHtml(input) {
    const clean = sanitize(input);
    if (!clean) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<!doctype html><body>${clean}</body>`, 'text/html');
    const wrapper = doc.createElement('div');
    while (doc.body.firstChild) wrapper.appendChild(doc.body.firstChild);
    applyCanonicalEmailStyles(wrapper);
    return wrapper.outerHTML;
  }

  function textToHtml(text) {
    const value = String(text || '').replace(/\r\n?/g, '\n');
    if (!value) return '';

    const escape = (part) => part
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

    return value
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.split('\n').map(escape).join('<br>')}</p>`)
      .join('');
  }

  return { sanitize, sanitizePaste, prepareForEditor, toEmailHtml, textToHtml, editorDefaultsCss, editorStyle };
})();
