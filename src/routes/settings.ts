// Admin settings: look, email, API keys and webhooks.
import type { Context, Hono } from "hono";
import { testEmail } from "../emails.js";
import { baseUrl, emit, sendEmailNow } from "../events.js";
import { isColor, isEmail, isPublicUrl, webhookEvents } from "../model.js";
import * as store from "../store.js";
import { apiPage, settingsPage, webhookPage } from "../views/admin.js";
import { message } from "../views/pages.js";
import { actorName, flash, idParam, navFor, notFound, render, text, who } from "../web.js";
import { canAdmin, currentMode, devStub } from "../whisk.js";

export const settingsRoutes = (app: Hono) => {
  const adminsOnly = async (c: Context, next: () => Promise<void>) => {
    if (!canAdmin(who(c)))
      return render(c, "Not allowed", message("Only admins can change settings", "Ask an owner of this business to add you to its training-admins group."), { status: 403 });
    await next();
  };
  app.use("/edit/settings", adminsOnly);
  app.use("/edit/settings/*", adminsOnly);

  const errors: Record<string, string> = {
    color: "Pick a color.",
    from: "The from address is not an email address.",
    notify: "The trainers' address is not an email address.",
    test: "The test email failed. The reason is in the list below.",
    url: "Use an https address on the public internet.",
    events: "Pick at least one event.",
    label: "Give the key a name.",
  };
  const err = (c: Context) => errors[c.req.query("err") ?? ""];

  app.get("/edit/settings", async (c) => {
    const [s, emails, nav] = await Promise.all([store.settings(), store.recentEmails(), navFor(c)]);
    return render(c, "Settings", settingsPage(s, emails, nav, who(c).email ?? "", flash(c), err(c), currentMode().locked), { nav: "edit" });
  });

  app.post("/edit/settings/look", async (c) => {
    const f = await c.req.parseBody();
    const accent = text(f.accent, 7);
    if (!isColor(accent)) return c.redirect("/edit/settings?err=color");
    await store.saveLook({ portal_name: text(f.portal_name, 80) || "Training", tagline: text(f.tagline, 200), accent: accent.toLowerCase() });
    await store.audit(actorName(who(c)), "Changed the portal's look");
    return c.redirect("/edit/settings?ok=saved");
  });

  app.post("/edit/settings/email", async (c) => {
    const f = await c.req.parseBody();
    const mode = f.mail_mode === "off" ? "off" : "whisk";
    const from = text(f.email_from, 200).toLowerCase();
    const notify = text(f.notify_email, 200).toLowerCase();
    if (from && !isEmail(from)) return c.redirect("/edit/settings?err=from#email");
    if (notify && !isEmail(notify)) return c.redirect("/edit/settings?err=notify#email");
    await store.saveMail({
      mail_mode: mode,
      email_from: from,
      notify_email: notify,
      reminders: f.reminders === "1",
    });
    await store.audit(actorName(who(c)), "Changed email settings", "", { mode });
    return c.redirect("/edit/settings?ok=saved#email");
  });

  // The test sends now, not in the background, so the result is on the page that follows.
  app.post("/edit/settings/test-email", async (c) => {
    const to = text((await c.req.parseBody()).to, 200) || who(c).email || "";
    if (!isEmail(to)) return c.redirect("/edit/settings?err=from#email");
    const m = await testEmail(await store.settings(), to);
    const id = await store.queueEmail({ kind: "test", ...m });
    try {
      const result = await sendEmailNow(id);
      return c.redirect(`/edit/settings?ok=${result === "demo" ? "test_held" : "test_sent"}#email`);
    } catch {
      return c.redirect("/edit/settings?err=test#email");
    }
  });

  // ----- API and webhooks -----

  const apiView = async (c: Context, newKey?: string) => {
    const [keys, hooks, nav] = await Promise.all([store.apiKeys(), store.webhooks(), navFor(c)]);
    const withFailures = await Promise.all(hooks.map(async (h) => ({ ...h, failing: (await store.recentDeliveries(h.id)).filter((d) => d.status === "failed").length })));
    return render(c, "API and webhooks", apiPage(keys, withFailures, baseUrl(), nav, newKey, flash(c), err(c), currentMode().locked, currentMode().keysNote), { nav: "edit" });
  };

  app.get("/edit/settings/api", (c) => apiView(c));

  app.post("/edit/settings/api/keys", async (c) => {
    const f = await c.req.parseBody();
    const label = text(f.label, 80);
    if (!label) return c.redirect("/edit/settings/api?err=label");
    const scope = f.scope === "write" ? "write" : "read";
    const key = await store.createKey(label, scope, actorName(who(c)));
    await store.audit(actorName(who(c)), "Made an API key", "", { name: label, access: scope });
    // Shown on this response only; nothing keeps the key itself.
    return apiView(c, key);
  });

  app.post("/edit/settings/api/keys/:id/revoke", async (c) => {
    await store.revokeKey(idParam(c));
    await store.audit(actorName(who(c)), "Turned off an API key", "", { key: String(idParam(c)) });
    return c.redirect("/edit/settings/api?ok=key_off");
  });

  const readHook = async (c: Context) => {
    const f = await c.req.parseBody({ all: true });
    const url = text(f.url, 500);
    const events = (Array.isArray(f.events) ? f.events : [f.events]).filter((e): e is string => typeof e === "string" && (webhookEvents as readonly string[]).includes(e));
    return { url, events, active: f.active === "1", problem: !(isPublicUrl(url) || (devStub() && /^http:\/\/localhost:\d+\//.test(url))) ? "url" : events.length === 0 ? "events" : "" };
  };

  app.post("/edit/settings/api/webhooks", async (c) => {
    const h = await readHook(c);
    if (h.problem) return c.redirect(`/edit/settings/api?err=${h.problem}`);
    const made = await store.createWebhook(h.url, h.events, actorName(who(c)));
    await store.audit(actorName(who(c)), "Added a webhook", "", { url: h.url });
    return c.redirect(`/edit/settings/api/webhooks/${made.id}?ok=created`);
  });

  app.get("/edit/settings/api/webhooks/:id", async (c) => {
    const h = await store.webhookById(idParam(c));
    if (!h) return notFound(c, "webhook");
    const [deliveries, nav] = await Promise.all([store.recentDeliveries(h.id), navFor(c)]);
    return render(c, "Webhook", webhookPage(h, deliveries, nav, flash(c), err(c), currentMode().locked), { nav: "edit" });
  });

  app.post("/edit/settings/api/webhooks/:id", async (c) => {
    const old = await store.webhookById(idParam(c));
    if (!old) return notFound(c, "webhook");
    const h = await readHook(c);
    if (h.problem) return c.redirect(`/edit/settings/api/webhooks/${old.id}?err=${h.problem}`);
    await store.updateWebhook(old.id, h.url, h.events, h.active);
    await store.audit(actorName(who(c)), "Changed a webhook", "", { url: h.url, on: h.active ? "yes" : "no" });
    return c.redirect(`/edit/settings/api/webhooks/${old.id}?ok=saved`);
  });

  app.post("/edit/settings/api/webhooks/:id/test", async (c) => {
    const h = await store.webhookById(idParam(c));
    if (!h) return notFound(c, "webhook");
    await emit("ping", { message: "A test from your training portal." }, h.id);
    return c.redirect(`/edit/settings/api/webhooks/${h.id}?ok=test_queued`);
  });

  app.post("/edit/settings/api/webhooks/:id/delete", async (c) => {
    const h = await store.webhookById(idParam(c));
    if (h) {
      await store.deleteWebhook(h.id);
      await store.audit(actorName(who(c)), "Deleted a webhook", "", { url: h.url });
    }
    return c.redirect("/edit/settings/api?ok=deleted");
  });
};
