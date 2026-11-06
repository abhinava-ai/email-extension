export const TemplateSanitizer: {
  sanitize(input: string): string;
  sanitizePaste(input: string): string;
  prepareForEditor(input: string): string;
  toEmailHtml(input: string): string;
  textToHtml(text: string): string;
  editorDefaultsCss(selector: string): string;
  editorStyle(): { fontFamily: string; fontSize: string; lineHeight: string; color: string; backgroundColor: string };
  parseHtml(html: string): Document;
};
