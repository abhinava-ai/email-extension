import { TemplateSanitizer } from "@/lib/template-sanitizer";

export type EmailEditor = { getHtml(): string; setHtml(html: string): void; destroy(): void };

const FONT_SIZES_PT = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const LINE_HEIGHTS = [1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2];
const FONTS = {
  "Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif": "Aptos",
  "Arial, Helvetica, sans-serif": "Arial",
  "Calibri, Arial, sans-serif": "Calibri",
  '"Segoe UI", Arial, sans-serif': "Segoe UI",
  "Georgia, serif": "Georgia",
  '"Times New Roman", Times, serif': "Times New Roman",
  "Verdana, Geneva, sans-serif": "Verdana",
  '"Trebuchet MS", Helvetica, sans-serif': "Trebuchet MS",
};
const BUTTONS = [
  "undo", "redo", "|",
  "paragraph", "font", "fontsize", "brush", "|",
  "bold", "italic", "underline", "strikethrough", "|",
  "ul", "ol", "outdent", "indent", "|",
  "left", "center", "right", "justify", "|",
  "link", "unlink", "table", "hr", "image", "|",
  "lineHeight", "eraser", "|",
  "source", "fullsize",
];

// Same settings as the extension's editor, using the formatting engine that prepares
// templates for Outlook. What shows in this canvas is what the email receives.
export async function createEmailEditor(textarea: HTMLTextAreaElement, onSave: () => void): Promise<EmailEditor> {
  // The complete build, as the extension uses. The default entry leaves out some icons and plugins.
  const bundle = await import("jodit/es2021/jodit.min.js");
  const Jodit = bundle.Jodit ?? bundle.default?.Jodit;
  if (!Jodit) throw new Error("The editor could not be loaded. Refresh the page and try again.");
  const defaults = document.createElement("style");
  defaults.textContent = TemplateSanitizer.editorDefaultsCss(".jodit-wysiwyg");
  document.head.appendChild(defaults);

  const editor = Jodit.make(textarea, {
    height: 520,
    minHeight: 320,
    width: "100%",
    toolbarAdaptive: false,
    toolbarSticky: false,
    toolbarButtonSize: "middle",
    saveSelectionOnBlur: true,
    sourceEditor: "area",
    beautifyHTML: false,
    spellcheck: true,
    enter: "p",
    defaultFontSizePoints: "pt",
    askBeforePasteHTML: false,
    askBeforePasteFromWord: false,
    processPasteHTML: false,
    processPasteFromWord: false,
    placeholder: "Write your reusable email here…",
    buttons: BUTTONS,
    controls: {
      font: { list: FONTS },
      fontsize: { list: Jodit.atom ? Jodit.atom(FONT_SIZES_PT) : FONT_SIZES_PT },
      lineHeight: { list: Jodit.atom ? Jodit.atom(LINE_HEIGHTS) : LINE_HEIGHTS },
    },
    style: TemplateSanitizer.editorStyle(),
    iframe: false,
    uploader: { insertImageAsBase64URI: false },
    filebrowser: false,
    showCharsCounter: true,
    showWordsCounter: true,
    showXPathInStatusbar: false,
  } as never) as unknown as {
    value: string;
    editor: HTMLElement;
    container: HTMLElement;
    s: { focus(): void; insertHTML(html: string, insertCursorAfter?: boolean): void; insertCursorAtPoint(x: number, y: number): void };
    synchronizeValues?(): void;
    getRealMode(): number;
    destruct(): void;
  };

  function insertClipboard(data: DataTransfer | null, event: Event) {
    if (!data) return;
    const rich = data.getData("text/html");
    const plain = data.getData("text/plain");
    if (!rich && !plain) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const clean = rich ? TemplateSanitizer.sanitizePaste(rich) : TemplateSanitizer.prepareForEditor(TemplateSanitizer.textToHtml(plain));
    editor.s.focus();
    editor.s.insertHTML(clean, true);
    editor.synchronizeValues?.();
  }

  // Runs before Jodit's own paste handling, which would otherwise rewrite the source formatting.
  const onPaste = (event: ClipboardEvent) => {
    if (editor.editor?.contains(event.target as Node)) insertClipboard(event.clipboardData, event);
  };
  const onDrop = (event: DragEvent) => {
    if (!editor.editor?.contains(event.target as Node)) return;
    editor.s.insertCursorAtPoint?.(event.clientX, event.clientY);
    insertClipboard(event.dataTransfer, event);
  };
  const onKeydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
    }
  };
  window.addEventListener("paste", onPaste, true);
  window.addEventListener("drop", onDrop, true);
  window.addEventListener("keydown", onKeydown, true);

  return {
    getHtml() {
      // In source view the rich value updates after a delay, so read the text box directly.
      const source = editor.container.querySelector<HTMLTextAreaElement>(".jodit-source textarea");
      const raw = source && editor.container.querySelector(".jodit-source")?.checkVisibility?.() ? source.value : editor.value;
      return TemplateSanitizer.prepareForEditor(raw || "");
    },
    setHtml(html) {
      editor.value = TemplateSanitizer.prepareForEditor(html);
      editor.synchronizeValues?.();
    },
    destroy() {
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("keydown", onKeydown, true);
      defaults.remove();
      editor.destruct();
    },
  };
}
