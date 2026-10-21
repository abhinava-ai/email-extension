import sanitizeHtml from "sanitize-html";
export function cleanTemplateHtml(html:string) {
  if (typeof html !== "string" || html.length > 500000) throw new Error("Template content is too large.");
  return sanitizeHtml(html, {
    allowedTags:["p","div","span","br","strong","b","em","i","u","s","ul","ol","li","blockquote","pre","code","table","thead","tbody","tfoot","tr","th","td","a","img","h1","h2","h3","h4","hr"],
    allowedAttributes:{"*":["style"],a:["href","title","target"],img:["src","alt","title","width","height"],td:["colspan","rowspan"],th:["colspan","rowspan"]},
    allowedSchemes:["http","https","mailto","cid"], allowedSchemesByTag:{img:["https","cid"]},
    allowedStyles:{"*":{"font-family":[/^[-a-zA-Z0-9 ,'\"]{1,120}$/],"font-size":[/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],color:[/^(?:#[0-9a-f]{3,8}|rgb\([0-9 ,.]+\)|[a-z]+)$/i],"background-color":[/^(?:#[0-9a-f]{3,8}|rgb\([0-9 ,.]+\)|[a-z]+)$/i],"font-weight":[/^(?:normal|bold|[1-9]00)$/],"font-style":[/^(?:normal|italic)$/],"text-decoration":[/^(?:none|underline|line-through)$/],"text-align":[/^(?:left|right|center|justify)$/],margin:[/^[0-9 .%-]+$/],padding:[/^[0-9 .%-]+$/],"line-height":[/^[0-9 .%-]+$/]}},
    disallowedTagsMode:"discard", enforceHtmlBoundary:true,
  });
}
