import DOMPurify from "dompurify";

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

const RICH_TEXT_PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "ul",
  ],
  ALLOWED_ATTR: ["href", "rel", "target"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|branchboard-file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function isRichTextHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function plainTextToRichTextHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split(/\n/).map((line) => escapeHtml(line));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

export function sanitizeRichTextHtml(value: string): string {
  if (!value.trim()) {
    return "";
  }

  const sanitized = DOMPurify.sanitize(value, RICH_TEXT_PURIFY_CONFIG);
  return sanitized === "<p></p>" ? "" : sanitized;
}

export function normalizeRichTextHtml(value: string): string {
  if (!value.trim()) {
    return "";
  }

  return sanitizeRichTextHtml(isRichTextHtml(value) ? value : plainTextToRichTextHtml(value));
}

export function richTextToPlainText(value: string): string {
  if (!value.trim()) {
    return "";
  }

  const html = normalizeRichTextHtml(value);
  if (typeof document === "undefined") {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}
