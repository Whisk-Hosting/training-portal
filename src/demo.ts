// Demo mode: the public live demo of this portal. It is on only with DEMO=1, which only
// demo/whisk.yaml sets; anywhere else every demo route answers 404 and the guest cookie is
// ignored. Everything the demo does differently lives in this file, so a copy can delete it
// (with demo/ and its two lines in src/index.ts) and nothing else changes.
//
// With it on:
// - an anonymous visitor sees a card with one button, Look around, which sets the guest cookie;
// - the guest is a trainer and an admin of the portal, and can take the courses like any
//   learner; a real signed-in person always wins over the cookie;
// - emails and webhook deliveries are recorded and never sent; invites (which make Whisk
//   customers) and uploads are refused; email and webhook settings are read-only;
// - the guest can make and turn off API keys and use them on the sample data, so visitors can
//   try the API; inviting through it is refused like the page (it needs a key first);
// - demo-reset empties the app's tables, API keys included, at 03:00 in New York and runs the first-install seed.
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { sql } from "./db.js";
import { sampleData } from "./seed.js";
import * as store from "./store.js";
import { render, who } from "./web.js";
import { inngest, log, setMode, type ApiError, type Identity, type Mode } from "./whisk.js";

// ----- Decisions -----

export const demoOn = (env: Readonly<Record<string, string | undefined>>) => env.DEMO === "1";

export const cookieName = "guest";
export const guestId = "demo-guest";

// cookieValue reads one cookie from a Cookie header, or nothing when it is not there.
export const cookieValue = (header: string | undefined, name: string): string | undefined =>
  (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .map((part) => [part.slice(0, part.indexOf("=")).trim(), part.slice(part.indexOf("=") + 1).trim()] as const)
    .find(([key]) => key === name)?.[1];

// asGuest makes an anonymous request that carries the guest cookie into the guest: a team
// member in the trainers and training-admins groups. Anyone signed in stays who they are.
export const asGuest = (id: Identity, cookies: string | undefined): Identity =>
  id.audience !== "anonymous" || cookieValue(cookies, cookieName) !== "1"
    ? id
    : { audience: "team", userId: guestId, email: "guest@example.com", name: "Guest", roles: ["member"], groups: ["trainers", "training-admins"], requestId: id.requestId, guest: true };

// The refusals, each with a stable code, a sentence and a fix.
export const refusals = {
  invites: {
    code: "DEMO_INVITES_OFF",
    message: "The demo does not invite anyone, because each invite makes a real Whisk customer.",
    fix: "Deploy your own copy of the portal to invite your customers. The sample learners show what invited learners look like.",
  },
  uploads: {
    code: "DEMO_UPLOADS_OFF",
    message: "The demo does not take files.",
    fix: "Deploy your own copy of the portal to upload videos and coursework.",
  },
  email: {
    code: "DEMO_EMAIL_HELD",
    message: "The demo records emails and never sends them.",
    fix: "Deploy your own copy of the portal to send email.",
  },
  locked: {
    code: "DEMO_SETTING_LOCKED",
    message: "This setting points outside the portal, so the demo shows it read-only.",
    fix: "Deploy your own copy of the portal to set your own email and webhooks.",
  },
} as const satisfies Record<string, ApiError>;
type Refusal = keyof typeof refusals;

// refusal says which Whisk API calls the demo never makes: anything that creates a customer or
// an upload, or sends an email.
export const refusal = (method: string, path: string): ApiError | undefined =>
  method !== "POST" ? undefined : path === "/customers" ? refusals.invites : path === "/uploads" ? refusals.uploads : path === "/email/send" ? refusals.email : undefined;

// The guest cookie. The platform binds it to the demo's own address as __Host-guest.
export const startCookie = `${cookieName}=1; HttpOnly; Secure; SameSite=Lax; Path=/`;
export const leaveCookie = `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

// tablesToEmpty is every table the app made, except the record of which migrations ran.
export const tablesToEmpty = (tables: readonly string[]) => tables.filter((t) => t !== "schema_migrations");

export const demoMode: Mode = {
  guest: asGuest,
  refuse: refusal,
  hold: true,
  locked: `${refusals.locked.message} ${refusals.locked.fix}`,
  challengeForms: true,
  keysNote: "In the demo, keys work on the sample data and are removed every night.",
};

// Pages that would reach outside the app, what each answers with instead, and how it answers.
const refusedPosts: readonly { path: string; why: Refusal; as: "page" | "json"; back: string }[] = [
  { path: "/edit/learners/add", why: "invites", as: "page", back: "/edit/learners" },
  { path: "/edit/learners/:user/resend", why: "invites", as: "page", back: "/edit/learners" },
  { path: "/edit/lessons/:id/upload", why: "uploads", as: "json", back: "" },
  { path: "/learn/:course/:lesson/upload", why: "uploads", as: "json", back: "" },
  { path: "/edit/settings/email", why: "locked", as: "page", back: "/edit/settings" },
  { path: "/edit/settings/api/webhooks", why: "locked", as: "page", back: "/edit/settings/api" },
  { path: "/edit/settings/api/webhooks/:id", why: "locked", as: "page", back: "/edit/settings/api" },
];

// ----- Pages -----

const landing = (portal: string) => html`
<div class="wrap" style="padding:72px 24px 96px">
  <section class="panel" style="max-width:38rem;margin:0 auto;text-align:center;padding:40px 28px">
    <span class="badge accent">Live demo</span>
    <h1 style="margin:16px 0 8px">${portal}</h1>
    <p class="lead" style="margin:0 auto 24px;max-width:32rem">A training portal for your customers: courses with videos, quizzes, coursework and certificates. Look around as a trainer, mark the work that is waiting, and take the sample course yourself.</p>
    <form method="post" action="/demo/start"><button class="btn primary">Look around</button></form>
    <p class="small muted" style="margin:20px 0 0">No sign-up. Emails and webhooks are recorded, never sent. Everything starts fresh each night.</p>
  </section>
</div>`;

const refusedPage = (r: ApiError, back: string) => html`
<div class="wrap" style="padding:80px 24px"><div class="empty">
  <h2>Not in the demo</h2>
  <p>${r.message}</p>
  <p>${r.fix}</p>
  <p class="small"><code>${r.code}</code></p>
  <a class="btn primary" href="${back}">Back</a>
</div></div>`;

const refuse = async (c: Context, why: Refusal, as: "page" | "json", back: string): Promise<Response> => {
  const r = refusals[why];
  if (as === "json") return c.json({ error: `${r.message} ${r.fix}`, code: r.code, fix: r.fix }, 403);
  return render(c, "Not in the demo", refusedPage(r, back), { status: 403 });
};

// ----- Nightly reset -----

// reset empties every table the app made and adds the sample data a first install gets, in one
// transaction, so visitors never see it half done.
export const reset = () =>
  sql.begin(async (tx) => {
    const found = await tx<{ tablename: string }[]>`select tablename from pg_tables where schemaname = current_schema()`;
    const tables = tablesToEmpty(found.map((r) => r.tablename));
    if (tables.length) await tx`truncate ${tx(tables)} restart identity cascade`;
    await tx`insert into settings (id) values (1) on conflict do nothing`;
    await sampleData(tx, true);
    return tables.length;
  });

const demoReset = inngest.createFunction({ id: "demo-reset", triggers: [{ cron: "TZ=America/New_York 0 3 * * *" }] }, async ({ step }) =>
  step.run("reset", async () => ({ emptied: await reset() })),
);

// ----- Wiring -----

// demo turns demo mode on when DEMO=1: the guest, the refusals and the demo's own routes, all
// registered ahead of the app's routes. It answers the functions to serve, which is demo-reset
// when on and nothing when off.
export const demo = (app: Hono, env: Readonly<Record<string, string | undefined>> = process.env) => {
  if (!demoOn(env)) return [];
  setMode(demoMode);

  app.post("/demo/start", (c) => {
    c.header("Set-Cookie", startCookie);
    return c.redirect("/edit", 303);
  });
  app.get("/demo/leave", (c) => {
    c.header("Set-Cookie", leaveCookie);
    return c.redirect("/", 303);
  });

  app.get("/", async (c, next) => {
    if (who(c).audience !== "anonymous") return next();
    return render(c, "Live demo", landing((await store.settings()).portal_name));
  });

  for (const r of refusedPosts) app.post(r.path, (c) => refuse(c, r.why, r.as, r.back));

  log.info("demo mode is on");
  return [demoReset];
};
