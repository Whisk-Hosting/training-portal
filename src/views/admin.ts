// Admin screens: the portal's look, email, API keys and webhooks.
import { html, raw } from "hono/html";
import { webhookEvents } from "../model.js";
import type { ApiKey, Delivery, Email, Settings, Webhook } from "../store.js";
import { icon } from "./icons.js";
import { notice } from "./layout.js";
import { editNav, type Nav } from "./nav.js";

const fmtTime = (d: Date | string) => new Date(d).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const checked = (on: boolean) => (on ? raw(" checked") : "");

const settingsTabs = (on: "general" | "api") => html`
<div class="tabs" role="tablist" style="margin-bottom:20px">
  <a role="tab" class="tab" aria-selected="${String(on === "general")}" href="/edit/settings">General</a>
  <a role="tab" class="tab" aria-selected="${String(on === "api")}" href="/edit/settings/api">API and webhooks</a>
</div>`;

const emailStatus = (e: Email) =>
  e.status === "sent" ? html`<span class="badge good">Sent</span>` : e.status === "failed" ? html`<span class="badge bad">Failed</span>` : e.status === "skipped" ? html`<span class="badge">Not sent</span>` : e.status === "demo" ? html`<span class="badge">Demo, not sent</span>` : html`<span class="badge warn">Sending</span>`;

// locked, when set, says why the settings that point outside the app are read-only.
const lockNote = (locked?: string) => (locked ? html`<p class="notice" role="note">${locked}</p>` : "");
const lockSet = (locked?: string) => (locked ? raw(" disabled") : "");

export const settingsPage = (s: Settings, emails: Email[], nav: Nav, me: string, flash?: string, error?: string, locked?: string) => html`
<div class="wrap" style="padding-bottom:80px">
  <section class="page-head"><h1>Settings</h1>${editNav("settings", nav)}</section>
  ${settingsTabs("general")}
  ${notice("good", flash)}${notice("error", error)}
  <div class="stack">
    <form method="post" action="/edit/settings/look" class="panel">
      <h3>Look</h3>
      <div class="field"><label for="pn">Portal name</label><input id="pn" type="text" name="portal_name" value="${s.portal_name}" required maxlength="80"></div>
      <div class="field"><label for="tg">Line under the name</label><input id="tg" type="text" name="tagline" value="${s.tagline}" maxlength="200"></div>
      <div class="field"><label for="ac">Color</label><div class="row"><input id="ac" type="color" name="accent" value="${s.accent}"><span class="hint">Buttons, progress, certificates and emails.</span></div></div>
      <button class="btn primary">Save</button>
    </form>

    <form method="post" action="/edit/settings/email" class="panel" id="email">
      <h3>Email</h3>
      ${lockNote(locked)}
      <fieldset class="plain"${lockSet(locked)}>
      <div class="field"><span class="label">Send email</span>
        <div class="segmented">
          <label><input type="radio" name="mail_mode" value="whisk"${checked(s.mail_mode === "whisk")}><span>On</span></label>
          <label><input type="radio" name="mail_mode" value="off"${checked(s.mail_mode === "off")}><span>Off</span></label>
        </div>
        <span class="hint">${s.mail_mode === "whisk" ? "Sent through Whisk email." : "Off: invite links show on screen for you to send."}</span></div>
      <div class="grid-2">
        <div class="field"><label for="ef">From address</label><input id="ef" type="email" name="email_from" value="${s.email_from}" maxlength="200" placeholder="training@example.com">
          <span class="hint">Empty sends from Whisk's address. Add your domain under Sending domains in your <a href="https://whisk.run" target="_blank" rel="noopener">Whisk business settings</a>.</span></div>
        <div class="field"><label for="ne">Trainers' address</label><input id="ne" type="email" name="notify_email" value="${s.notify_email}" maxlength="200" placeholder="trainers@example.com">
          <span class="hint">Gets handed-in work and learners' replies.</span></div>
      </div>
      <div class="field"><label class="check"><input type="checkbox" name="reminders" value="1"${checked(s.reminders)}> Weekly reminders to learners with unfinished courses</label></div>
      <button class="btn primary">Save</button>
      </fieldset>
    </form>

    <div class="panel">
      <div class="spread"><h3 style="margin:0">Sent email</h3>
        <form method="post" action="/edit/settings/test-email" class="inline"><input type="hidden" name="to" value="${me}"><button class="btn small"${s.mail_mode === "off" ? raw(" disabled") : ""}>${icon.mail} Send me a test</button></form></div>
      ${emails.length === 0
        ? html`<p class="small muted">Nothing sent yet.</p>`
        : html`<div class="table-wrap"><table class="table"><tbody>${emails.map((e) => html`<tr>
          <td class="small" style="white-space:nowrap">${fmtTime(e.created_at)}</td>
          <td><b class="small">${e.subject}</b><br><span class="small muted">${e.to_email}</span>${e.error && e.status !== "sent" ? html`<br><span class="small" style="color:var(--bad)">${e.error}</span>` : ""}</td>
          <td style="text-align:right">${emailStatus(e)}</td></tr>`)}</tbody></table></div>`}
    </div>

    <div class="panel">
      <h3>Who can do what</h3>
      <table class="table small"><tbody>
        <tr><td><b>Admins</b></td><td>Owners and admins of your Whisk business, and its <b>training-admins</b> group. Everything trainers do, plus settings, removing people, resetting progress and the change log.</td></tr>
        <tr><td><b>Trainers</b></td><td>Developers, and the <b>trainers</b> group. Write courses, add and enroll learners, mark coursework.</td></tr>
        <tr><td><b>Learners</b></td><td>Customers you add, and the rest of your team. Take courses.</td></tr>
      </tbody></table>
    </div>
  </div>
</div>`;

export const apiPage = (keys: ApiKey[], hooks: (Webhook & { failing: number })[], base: string, nav: Nav, newKey?: string, flash?: string, error?: string, locked?: string, keysNote?: string) => html`
<div class="wrap" style="padding-bottom:80px">
  <section class="page-head"><h1>Settings</h1>${editNav("settings", nav)}</section>
  ${settingsTabs("api")}
  ${notice("good", flash)}${notice("error", error)}
  <div class="stack">
    <div class="panel">
      <h3>API keys</h3>
      <p class="muted small" style="margin-top:0">For other systems and AI agents, through the JSON API at <code>${base}/api/v1</code>.${keysNote ? ` ${keysNote}` : ""}</p>
      ${newKey
        ? html`<div class="notice good"><div class="label" style="margin-bottom:8px">Copy the key now. It won't show again.</div>
          <div class="copyfield"><input id="new-key" type="text" readonly value="${newKey}"><button type="button" class="btn small" data-copy="new-key">${icon.copy}<span class="label">Copy</span></button></div></div>`
        : ""}
      ${keys.length === 0
        ? html`<p class="small muted">No keys yet.</p>`
        : html`<div class="table-wrap"><table class="table"><tbody>${keys.map((k) => html`<tr${k.revoked_at ? raw(' class="faded"') : ""}>
          <td><b>${k.label}</b><br><code class="small">${k.prefix}…</code></td>
          <td>${k.scope === "write" ? html`<span class="badge accent">Read and write</span>` : html`<span class="badge">Read only</span>`}</td>
          <td class="small muted">${k.revoked_at ? `Turned off ${fmtTime(k.revoked_at)}` : k.last_used_at ? `Used ${fmtTime(k.last_used_at)}` : "Not used yet"}</td>
          <td style="text-align:right">${k.revoked_at ? "" : html`<form method="post" action="/edit/settings/api/keys/${k.id}/revoke" class="inline" data-confirm="Turn off ${k.label}? Anything using it stops working."><button class="btn small ghost danger">Turn off</button></form>`}</td>
        </tr>`)}</tbody></table></div>`}
      <form method="post" action="/edit/settings/api/keys" class="row" style="margin-top:16px;align-items:flex-end">
        <div class="field" style="flex:1;min-width:200px;margin:0"><label for="kl">Name</label><input id="kl" type="text" name="label" required maxlength="80" placeholder="CRM"></div>
        <div class="field" style="margin:0"><label for="ks">Access</label><select id="ks" name="scope"><option value="read">Read only</option><option value="write">Read and write</option></select></div>
        <button class="btn">${icon.key} Make key</button>
      </form>
      <details style="margin-top:20px"><summary class="small" style="cursor:pointer;font-weight:650">How to use the API</summary>
        <pre class="codeblock">curl ${base}/api/v1/learners \\
  -H "Authorization: Bearer YOUR_KEY"

curl ${base}/api/v1/learners \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "ana@example.com", "name": "Ana Silva", "courses": ["getting-started"], "due_on": "2026-12-01"}'</pre>
        <p class="small muted">GET ${base}/api/v1 lists every endpoint. Errors come back as {"error": {"code", "message", "fix"}}.</p>
      </details>
    </div>

    <div class="panel">
      <h3>Webhooks</h3>
      ${hooks.length === 0
        ? html`<p class="small muted">No webhooks yet.</p>`
        : html`<div class="table-wrap"><table class="table"><tbody>${hooks.map((h) => html`<tr>
          <td><a href="/edit/settings/api/webhooks/${h.id}"><b class="small" style="word-break:break-all">${h.url}</b></a><br><span class="small muted">${h.events.length === webhookEvents.length ? "Every event" : `${h.events.length} events`}</span></td>
          <td style="text-align:right">${!h.active ? html`<span class="badge">Paused</span>` : h.failing ? html`<span class="badge bad">${h.failing} failing</span>` : html`<span class="badge good">On</span>`}</td>
        </tr>`)}</tbody></table></div>`}
      <form method="post" action="/edit/settings/api/webhooks" style="margin-top:16px">
        ${lockNote(locked)}
        <fieldset class="plain"${lockSet(locked)}>
        <div class="field"><label for="wu">Address</label><input id="wu" type="url" name="url" required maxlength="500" placeholder="https://hooks.yourcrm.com/training"></div>
        ${eventChecks(webhookEvents as readonly string[])}
        <button class="btn">${icon.plus} Add webhook</button>
        </fieldset>
      </form>
    </div>
  </div>
</div>`;

const eventLabels: Record<string, string> = {
  "learner.invited": "Learner invited",
  "learner.enrolled": "Learner enrolled in a course",
  "learner.removed": "Learner removed",
  "lesson.completed": "Lesson finished",
  "quiz.passed": "Quiz passed",
  "quiz.failed": "Quiz failed",
  "assignment.submitted": "Coursework handed in",
  "assignment.marked": "Coursework marked",
  "course.completed": "Course finished",
};

const eventChecks = (on: readonly string[]) => html`
<fieldset class="events"><legend class="label">Events</legend>
  ${webhookEvents.map((e) => html`<label class="check"><input type="checkbox" name="events" value="${e}"${checked(on.includes(e))}> <span>${eventLabels[e]} <code class="small muted">${e}</code></span></label>`)}
</fieldset>`;

const deliveryStatus = (d: Delivery) =>
  d.status === "delivered" ? html`<span class="badge good">Delivered</span>` : d.status === "failed" ? html`<span class="badge bad">Failed</span>` : d.status === "demo" ? html`<span class="badge">Demo, not sent</span>` : d.attempts ? html`<span class="badge warn">Retrying</span>` : html`<span class="badge">Queued</span>`;

export const webhookPage = (h: Webhook, deliveries: Delivery[], nav: Nav, flash?: string, error?: string, locked?: string) => html`
<div class="wrap" style="padding-bottom:80px">
  <section class="page-head"><div class="crumbs"><a href="/edit/settings/api">API and webhooks</a></div><h1>Webhook</h1>${editNav("settings", nav)}</section>
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      <h2>Recent deliveries</h2>
      ${deliveries.length === 0
        ? html`<div class="empty"><p>Nothing sent yet. Send a test to check the receiver.</p></div>`
        : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table"><tbody>${deliveries.map((d) => html`<tr>
          <td class="small" style="white-space:nowrap">${fmtTime(d.created_at)}</td>
          <td><code class="small">${d.event}</code>${d.last_error ? html`<br><span class="small" style="color:var(--bad)">${d.last_error}</span>` : ""}</td>
          <td class="small muted">${d.attempts} ${d.attempts === 1 ? "try" : "tries"}</td>
          <td style="text-align:right">${deliveryStatus(d)}</td></tr>`)}</tbody></table></div>`}
      <h2 style="margin-top:32px">Checking the signature</h2>
      <p class="small muted">Each delivery is a JSON POST with a <code>webhook-signature</code> header: <code>t=&lt;unix time&gt;,v1=&lt;HMAC-SHA256 of "t.body" with your secret&gt;</code>. Failed deliveries retry with backoff for about a day.</p>
      <pre class="codeblock">const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const expected = crypto.createHmac("sha256", secret).update(t + "." + rawBody).digest("hex");
const ok = expected === v1 &amp;&amp; Math.abs(Date.now() / 1000 - Number(t)) &lt; 300;</pre>
    </div>
    <aside>
      <form method="post" action="/edit/settings/api/webhooks/${h.id}" class="panel">
        ${lockNote(locked)}
        <fieldset class="plain"${lockSet(locked)}>
        <div class="field"><label for="wu">Address</label><input id="wu" type="url" name="url" value="${h.url}" required maxlength="500"></div>
        ${eventChecks(h.events)}
        <div class="field"><label class="check"><input type="checkbox" name="active" value="1"${checked(h.active)}> On</label></div>
        <button class="btn primary">Save</button>
        </fieldset>
      </form>
      <div class="panel" style="margin-top:20px">
        <h3>Signing secret</h3>
        <details><summary class="small" style="cursor:pointer">Show</summary>
          <div class="copyfield" style="margin-top:8px"><input id="wsec" type="text" readonly value="${h.secret}"><button type="button" class="btn small" data-copy="wsec">${icon.copy}<span class="label">Copy</span></button></div></details>
        <hr class="rule">
        <form method="post" action="/edit/settings/api/webhooks/${h.id}/test" style="margin-bottom:10px"><button class="btn small">Send a test</button></form>
        <form method="post" action="/edit/settings/api/webhooks/${h.id}/delete" data-confirm="Delete this webhook?"><button class="btn small danger">${icon.trash} Delete</button></form>
      </div>
    </aside>
  </div>
</div>`;
