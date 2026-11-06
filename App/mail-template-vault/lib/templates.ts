import sanitizeHtml from "sanitize-html";

// Keeps these in step with the extension's sanitizer.js. A style dropped here is lost for
// good, and the template no longer looks the same in the editor and in Outlook.
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([0-9 ,.%/]+\)|[a-z]+)$/i;
const LENGTH = "-?\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%|in|cm|mm)?";
const LENGTHS = new RegExp(`^(?:auto|${LENGTH})(?: (?:auto|${LENGTH})){0,3}$`, "i");
const SIZE = new RegExp(`^(?:auto|${LENGTH})$`, "i");
// The width, style and colour of a border, in any order. Never a url().
const BORDER = /^(?:(?:thin|medium|thick|none|hidden|solid|dashed|dotted|double|initial|-?\d+(?:\.\d+)?(?:px|pt|em)?|#[0-9a-f]{3,8}|rgba?\([0-9 ,.%/]+\)|[a-z]+)(?: |$)){1,6}$/i;
const LIST_TYPE = /^(?:disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/;
const DECORATION = /^(?:none|underline|line-through|overline)(?: (?:underline|line-through|overline))*(?: [a-z#0-9(),. ]+)?$/i;

const ALLOWED_STYLES: Record<string, RegExp[]> = {
  "font-family": [/^[\p{L}\p{N}\s,'"_-]{1,300}$/u],
  "font-size": [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
  "font-weight": [/^(?:normal|bold|[1-9]00)$/],
  "font-style": [/^(?:normal|italic|oblique)$/],
  "line-height": [/^(?:normal|\d+(?:\.\d+)?(?:px|pt|em|%)?)$/],
  color: [COLOR],
  "background-color": [COLOR],
  "text-align": [/^(?:left|right|center|justify)$/],
  "text-indent": [SIZE],
  "text-decoration": [DECORATION],
  "text-decoration-line": [DECORATION],
  "white-space": [/^(?:normal|pre|pre-wrap|pre-line|break-spaces)$/],
  "vertical-align": [/^(?:top|middle|bottom|baseline)$/],
  "list-style": [/^[a-z -]{1,40}$/],
  "list-style-type": [LIST_TYPE],
  "list-style-position": [/^(?:inside|outside)$/],
  "border-collapse": [/^(?:collapse|separate)$/],
  "border-spacing": [LENGTHS],
  width: [SIZE],
  height: [SIZE],
  "max-width": [SIZE],
  margin: [LENGTHS],
  padding: [LENGTHS],
  border: [BORDER],
  "border-width": [BORDER],
  "border-style": [BORDER],
  "border-color": [BORDER],
};
for (const side of ["top", "right", "bottom", "left"]) {
  ALLOWED_STYLES[`margin-${side}`] = [SIZE];
  ALLOWED_STYLES[`padding-${side}`] = [SIZE];
  ALLOWED_STYLES[`border-${side}`] = [BORDER];
  ALLOWED_STYLES[`border-${side}-width`] = [BORDER];
  ALLOWED_STYLES[`border-${side}-style`] = [BORDER];
  ALLOWED_STYLES[`border-${side}-color`] = [BORDER];
}

const SIZE_ATTRIBUTES = ["width", "height"];

export function cleanTemplateHtml(html: string) {
  if (typeof html !== "string" || html.length > 500000) throw new Error("Template content is too large.");
  return sanitizeHtml(html, {
    allowedTags: ["p", "div", "span", "br", "strong", "b", "em", "i", "u", "s", "sub", "sup", "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "hr"],
    allowedAttributes: {
      "*": ["style", "dir", "lang"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", ...SIZE_ATTRIBUTES],
      table: [...SIZE_ATTRIBUTES, "cellpadding", "cellspacing", "border"],
      td: ["colspan", "rowspan", ...SIZE_ATTRIBUTES],
      th: ["colspan", "rowspan", ...SIZE_ATTRIBUTES],
      ol: ["start"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowedStyles: { "*": ALLOWED_STYLES },
    // An image may be embedded, but no other kind of data: address gets through.
    exclusiveFilter: (frame) => frame.tag === "img" && /^data:/i.test(frame.attribs.src || "") && !/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(frame.attribs.src || ""),
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}
