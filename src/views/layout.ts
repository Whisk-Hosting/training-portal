import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { isColor } from "../model.js";
import type { Settings } from "../store.js";
import { canEdit, currentMode, type Identity } from "../whisk.js";
import { icon } from "./icons.js";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type Page = {
  s: Settings;
  id: Identity;
  title: string;
  nav?: "courses" | "me" | "edit";
  body: Html;
  // Path to come back to after signing in.
  here?: string;
};

const current = (on: boolean) => (on ? raw(' aria-current="page"') : "");

export const layout = ({ s, id, title, nav, body, here = "/" }: Page) => {
  const signedIn = id.audience === "team" || id.audience === "customer";
  const accent = isColor(s.accent) ? s.accent : "#e85d2a";
  return html`<!doctype html>
<html lang="en"${currentMode().challengeForms ? raw(" data-challenge") : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title === s.portal_name ? title : `${title} · ${s.portal_name}`}</title>
<link rel="preload" href="/assets/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css?v=5">
<style>:root { --accent: ${raw(accent)}; }</style>
<link rel="icon" href="data:image/svg+xml,${raw(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${accent}"/></svg>`))}">
<script src="/assets/app.js?v=5" defer></script>
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-dot"></span>${s.portal_name}</a>
    <nav class="nav" aria-label="Main">
      <a href="/"${current(nav === "courses")}>${icon.read}<span class="label">Courses</span></a>
      ${signedIn ? html`<a href="/me"${current(nav === "me")}>${icon.award}<span class="label">My learning</span></a>` : ""}
      ${canEdit(id) ? html`<a href="/edit"${current(nav === "edit")}>${icon.edit}<span class="label">Edit</span></a>` : ""}
      ${id.guest
        ? ""
        : signedIn
        ? html`<a href="/.whisk/logout?return=/" title="Signed in as ${id.email}">Sign out</a>`
        : html`<a href="/.whisk/login?return=${encodeURIComponent(here)}">Sign in</a>`}
    </nav>
  </div>
</header>
${id.guest
  ? html`<div class="demo-strip"><div class="wrap"><span>You are looking around a demo as a trainer. Other visitors share it, and it starts fresh every night.</span><a href="/demo/leave">Leave demo</a></div></div>`
  : ""}
<main>${body}</main>
<footer class="site"><div class="wrap spread"><span>${s.portal_name}</span><span>Runs on <a href="https://whisk.run">Whisk</a></span></div></footer>
</body>
</html>`;
};

export const notice = (kind: "good" | "error" | "", text?: string) => (text ? html`<div class="notice ${kind}" role="status">${text}</div>` : "");
