// Lesson text is Markdown written by editors. Raw HTML is shown as text and links may only go
// to http(s), mailto or a path, so a lesson can never run script in a learner's browser.
import { Marked, type Tokens } from "marked";

export const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const safeHref = (href: string) => (/^(https?:|mailto:|\/|#)/i.test(href.trim()) ? href.trim() : "#");

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escape(token.text);
    },
    link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Link) {
      const href = safeHref(token.href);
      const external = /^https?:/i.test(href);
      const title = token.title ? ` title="${escape(token.title)}"` : "";
      return `<a href="${escape(href)}"${title}${external ? ' rel="noopener" target="_blank"' : ""}>${this.parser.parseInline(token.tokens)}</a>`;
    },
    image(token: Tokens.Image) {
      const src = safeHref(token.href);
      return `<img src="${escape(src)}" alt="${escape(token.text)}" loading="lazy">`;
    },
  },
});

export const markdown = (src: string): string => marked.parse(src, { async: false }) as string;
