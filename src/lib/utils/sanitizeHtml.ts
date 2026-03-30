import DOMPurify from "dompurify";

/**
 * Sanitiza HTML para exibição segura (ex.: conteúdo TipTap de premiação/cronograma).
 * Remove scripts, event handlers e URIs javascript:.
 * Permite tags comuns de texto rico: p, strong, em, listas, links, etc.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (html == null || typeof html !== "string") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "span",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "blockquote", "code", "pre",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ADD_ATTR: ["target", "rel"],
  });
}
