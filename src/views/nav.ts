import { html } from "hono/html";
import { icon } from "./icons.js";

// What the staff menu needs: whether this person runs the portal, and how much is waiting.
export type Nav = { admin: boolean; toMark: number };
export type Section = "courses" | "learners" | "groups" | "marking" | "settings" | "log";

const tab = (on: boolean, href: string, label: unknown) => html`<a class="btn small ${on ? "primary" : "ghost"}" href="${href}">${label}</a>`;

export const editNav = (on: Section, nav: Nav) => html`
<div class="row subnav">
  ${tab(on === "courses", "/edit", html`${icon.read} Courses`)}
  ${tab(on === "learners", "/edit/learners", html`${icon.people} Learners`)}
  ${tab(on === "groups", "/edit/groups", html`${icon.layers} Groups`)}
  ${tab(on === "marking", "/edit/marking", html`${icon.inbox} To mark${nav.toMark ? html` <span class="count-pill">${nav.toMark}</span>` : ""}`)}
  ${nav.admin ? tab(on === "settings", "/edit/settings", html`${icon.settings} Settings`) : ""}
  ${nav.admin ? tab(on === "log", "/edit/log", html`${icon.clock} Change log`) : ""}
</div>`;
