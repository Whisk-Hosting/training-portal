// Small helpers every page route shares: who is asking, rendering inside the layout, reading
// form fields, and the access checks.
import type { Context } from "hono";
import { mayTake, type Course, type Viewer } from "./model.js";
import * as store from "./store.js";
import { layout, type Html } from "./views/layout.js";
import type { Nav } from "./views/nav.js";
import { message } from "./views/pages.js";
import { canAdmin, canEdit, identity, type Identity } from "./whisk.js";

export const who = (c: Context): Identity => identity((n) => c.req.header(n));
export const signedIn = (id: Identity) => id.audience === "team" || id.audience === "customer";
export const learnerName = (id: Identity) => id.name?.trim() || id.email || "Learner";
export const actorName = (id: Identity) => id.email || id.name || "someone";

export const render = async (c: Context, title: string, body: Html, opts: { nav?: "courses" | "me" | "edit"; status?: 200 | 400 | 403 | 404 | 502 } = {}) =>
  c.html(layout({ s: await store.settings(), id: who(c), title, nav: opts.nav, body, here: c.req.path }), opts.status ?? 200);

export const notFound = (c: Context, what = "page") =>
  render(c, "Not found", message(`No such ${what}`, "It may have been moved or removed.", { href: "/", label: "See the courses" }), { status: 404 });

// Messages shown after a redirect, by key, so no text travels in the URL.
const flashes: Record<string, string> = {
  saved: "Saved.",
  created: "Created.",
  deleted: "Deleted.",
  added: "Added.",
  enrolled: "Enrolled.",
  removed: "Access removed.",
  restored: "Access given back.",
  reset: "Progress cleared.",
  completed: "Marked as finished.",
  revoked: "Certificate withdrawn.",
  resent: "Invite sent again.",
  resent_link: "Here is their link again. Email is off, so send it yourself.",
  marked: "Marked.",
  handed: "Handed in. A trainer will mark it.",
  test_sent: "Test email sent. Check your inbox.",
  test_held: "This is a demo, so the test email was recorded below and not sent.",
  key_off: "Key turned off.",
  test_queued: "Test sent. It shows below in a moment.",
};
export const flash = (c: Context) => flashes[c.req.query("ok") ?? ""];

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const intIn = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
export const idParam = (c: Context, name = "id") => {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export const navFor = async (c: Context): Promise<Nav> => ({ admin: canAdmin(who(c)), toMark: await store.toMarkCount() });

// viewerOf is what decides which courses a person may take.
export const viewerOf = (id: Identity) => store.viewer(id, canEdit(id));

export const mayOpen = (course: Course, v: Viewer) => mayTake(course, v);

export const removedPage = (c: Context) =>
  render(c, "No access", message("Your access has been removed", "Ask the business that invited you if you think this is a mistake."), { status: 403 });
