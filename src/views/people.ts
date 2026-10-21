// Staff screens for people: learners, adding them, one person, groups, marking, the change log.
import { html, raw } from "hono/html";
import { bytes, dueState, plural, type Course } from "../model.js";
import type { InviteResult } from "../people.js";
import type { AuditRow, Group, LearnerCourse, LearnerRow, QueueItem, Submission } from "../store.js";
import { icon } from "./icons.js";
import { notice } from "./layout.js";
import { editNav, type Nav } from "./nav.js";

const fmt = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtTime = (d: Date | string) => new Date(d).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const selected = (on: boolean) => (on ? raw(" selected") : "");
const today = () => new Date();

export const statusBadge = (s: string) =>
  s === "active" ? html`<span class="badge good">Active</span>` : s === "removed" ? html`<span class="badge bad">Removed</span>` : html`<span class="badge">Invited</span>`;

export const dueBadge = (due: Date | string | null, complete: boolean) => {
  const state = dueState(due ? new Date(due) : null, complete, today());
  if (state === "none" || state === "done") return "";
  const label = `Due ${fmt(due!)}`;
  return state === "overdue" ? html`<span class="badge bad">Overdue</span>` : state === "soon" ? html`<span class="badge warn">${label}</span>` : html`<span class="badge">${label}</span>`;
};

export const markBadge = (s: string) =>
  s === "passed" ? html`<span class="badge good">Passed</span>` : s === "redo" ? html`<span class="badge warn">Try again</span>` : html`<span class="badge accent">To mark</span>`;

const head = (title: string, on: Parameters<typeof editNav>[0], nav: Nav, crumbs?: unknown) => html`
<section class="page-head">${crumbs ? html`<div class="crumbs">${crumbs}</div>` : ""}<h1>${title}</h1>${editNav(on, nav)}</section>`;

// ----- Learners -----

export type LearnerFilters = { q: string; group: number | null; status: string };

export const learnersPage = (rows: LearnerRow[], groups: Group[], f: LearnerFilters, nav: Nav, flash?: string) => {
  const filtered = !!(f.q || f.group || f.status);
  return html`
<div class="wrap" style="padding-bottom:80px">
  ${head("Learners", "learners", nav)}
  ${notice("good", flash)}
  <div class="toolbar">
    <form method="get" action="/edit/learners" class="filters">
      <input type="search" name="q" value="${f.q}" placeholder="Name or email" aria-label="Search by name or email">
      <select name="group" aria-label="Group"><option value="">All groups</option>${groups.map((g) => html`<option value="${g.id}"${selected(f.group === g.id)}>${g.name}</option>`)}</select>
      <select name="status" aria-label="Status"><option value="">Everyone</option>
        ${(["invited", "active", "removed"] as const).map((s) => html`<option value="${s}"${selected(f.status === s)}>${s[0].toUpperCase() + s.slice(1)}</option>`)}</select>
      <button class="btn small">Filter</button>
      ${filtered ? html`<a class="btn small ghost" href="/edit/learners">Clear</a>` : ""}
    </form>
    <div class="row">
      <a class="btn small" href="/edit/export/progress.csv">${icon.download} Export</a>
      <a class="btn small primary" href="/edit/learners/add">${icon.plus} Add learners</a>
    </div>
  </div>
  ${rows.length === 0
    ? filtered
      ? html`<div class="empty"><h2>No one matches</h2><p>Try another name, group or status.</p></div>`
      : html`<div class="empty"><h2>No learners yet</h2><p>Add the customers you want to train. Paste a list if you have one.</p><a class="btn primary" href="/edit/learners/add">${icon.plus} Add learners</a></div>`
    : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table">
      <thead><tr><th>Person</th><th>Group</th><th>Status</th><th>Courses</th><th>Lessons done</th><th>Certificates</th><th>Last seen</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <td><a href="/edit/learners/${encodeURIComponent(r.user_id)}" style="text-decoration:none"><b>${r.name || r.email}</b><br><span class="small muted">${r.email}${r.audience === "team" ? " · team" : ""}</span></a></td>
        <td>${r.group_name ?? html`<span class="muted">None</span>`}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.enrolments}</td><td>${r.done}</td><td>${r.certificates}</td>
        <td class="small">${r.status === "invited" ? html`<span class="muted">Not yet</span>` : fmt(r.last_seen)}</td>
      </tr>`)}</tbody></table></div>
      <p class="small muted">${plural(rows.length, "person", "people")}</p>`}
</div>`;
};

export const courseChecks = (courses: Course[], name = "course") =>
  courses.length === 0
    ? html`<p class="muted small">No courses yet.</p>`
    : courses.map(
        (c) => html`<label class="check" style="margin-bottom:8px"><input type="checkbox" name="${name}" value="${c.id}"> <span>${c.title}
          ${c.published ? "" : html`<span class="badge">Draft</span>`}${c.access === "enrolled" ? html` <span class="badge">Invite only</span>` : ""}</span></label>`,
      );

export const addLearnersPage = (courses: Course[], groups: Group[], mailOn: boolean, nav: Nav, error?: string, draft = "") => html`
<div class="wrap">
  ${head("Add learners", "learners", nav, html`<a href="/edit/learners">Learners</a>`)}
  ${notice("error", error)}
  <form method="post" action="/edit/learners/add" class="editor">
    <div class="panel">
      <div class="field"><label for="people">People, one per line</label>
        <textarea id="people" name="people" rows="12" required maxlength="200000" placeholder="ana@example.com, Ana Silva, Retail&#10;ben@example.com, Ben Ng&#10;cara@example.com">${draft}</textarea>
        <span class="hint">Email, then name and group if you have them. A column pasted from a spreadsheet works.</span></div>
    </div>
    <aside class="panel">
      <h3>Courses</h3>
      ${courseChecks(courses)}
      <div class="field" style="margin-top:12px"><label for="due">Due by</label><input id="due" type="date" name="due"></div>
      <div class="field"><label for="grp">Group</label><select id="grp" name="group"><option value="">No group</option>${groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select>
        <span class="hint">A group on a pasted line wins.</span></div>
      <div class="field"><label class="check"><input type="checkbox" name="send_email" value="1"${mailOn ? raw(" checked") : raw(" disabled")}> Email them their link</label>
        ${mailOn ? "" : html`<span class="hint">Email is off, so you'll get the links to send. <a href="/edit/settings#email">Set up email</a></span>`}</div>
      <button class="btn primary">${icon.plus} Add learners</button>
    </aside>
  </form>
</div>`;

export const inviteResultsPage = (results: InviteResult[], problems: { line: number; text: string; why: string }[], nav: Nav) => {
  const toSend = results.filter((r) => r.outcome !== "failed" && !r.emailed && r.link);
  const ok = results.filter((r) => r.outcome !== "failed").length;
  return html`
<div class="wrap" style="padding-bottom:80px">
  ${head("Add learners", "learners", nav, html`<a href="/edit/learners">Learners</a>`)}
  ${notice(ok ? "good" : "error", `Added ${plural(ok, "person", "people")}${results.length - ok ? `, ${results.length - ok} failed` : ""}${problems.length ? `, ${plural(problems.length, "line")} skipped` : ""}.`)}
  ${toSend.length
    ? html`<div class="panel" style="margin-bottom:20px"><h3>Links to send</h3>
      <p class="small muted" style="margin-top:0">Each person signs in with their own link.</p>
      <textarea id="all-links" readonly rows="${Math.min(10, toSend.length + 1)}" class="code" style="min-height:0">${toSend.map((r) => `${r.email}\t${r.link}`).join("\n")}</textarea>
      <button type="button" class="btn small" data-copy="all-links" style="margin-top:8px">${icon.copy}<span class="label">Copy all</span></button></div>`
    : ""}
  <div class="panel table-wrap" style="padding:8px 12px"><table class="table">
    <thead><tr><th>Person</th><th>Result</th></tr></thead>
    <tbody>
      ${results.map((r) => html`<tr>
        <td>${r.user_id ? html`<a href="/edit/learners/${encodeURIComponent(r.user_id)}"><b>${r.name || r.email}</b></a>` : html`<b>${r.name || r.email}</b>`}<br><span class="small muted">${r.email}</span></td>
        <td>${r.outcome === "failed"
          ? html`<span class="badge bad">Failed</span> <span class="small">${r.error}</span>`
          : html`<span class="badge good">${r.outcome === "added" ? "Added" : "Already here"}</span> <span class="small muted">${r.emailed ? "Emailed their link" : "Send their link"}</span>`}</td>
      </tr>`)}
      ${problems.map((p) => html`<tr><td><code>${p.text}</code><br><span class="small muted">Line ${p.line}</span></td><td><span class="badge bad">Skipped</span> <span class="small">${p.why}</span></td></tr>`)}
    </tbody></table></div>
  <div class="row" style="margin-top:20px"><a class="btn" href="/edit/learners/add">${icon.plus} Add more</a><a class="btn ghost" href="/edit/learners">Back to learners</a></div>
</div>`;
};

export type LearnerView = {
  r: LearnerRow;
  courses: LearnerCourse[];
  allCourses: Course[];
  groups: Group[];
  work: QueueItem[];
  changes: AuditRow[];
  nav: Nav;
  flash?: string;
  error?: string;
  link?: string;
  mailOn: boolean;
};

export const learnerPage = (v: LearnerView) => {
  const { r, nav } = v;
  const id = encodeURIComponent(r.user_id);
  const notIn = v.allCourses.filter((c) => !v.courses.some((x) => x.course_id === c.id && x.enrolled));
  return html`
<div class="wrap" style="padding-bottom:80px">
  ${head(r.name || r.email, "learners", nav, html`<a href="/edit/learners">Learners</a>`)}
  <div class="row" style="margin:-8px 0 20px">${statusBadge(r.status)}<span class="muted small">${r.email}${r.group_name ? ` · ${r.group_name}` : ""} · ${r.status === "invited" ? `invited ${r.invited_at ? fmt(r.invited_at) : ""}` : `last seen ${fmt(r.last_seen)}`}</span></div>
  ${notice("good", v.flash)}${notice("error", v.error)}
  ${v.link ? html`<div class="notice good"><div class="label" style="margin-bottom:8px">Their sign-in link</div><div class="copyfield"><input id="invite-link" type="text" readonly value="${v.link}"><button type="button" class="btn small" data-copy="invite-link">${icon.copy}<span class="label">Copy</span></button></div></div>` : ""}
  <div class="editor">
    <div>
      <h2>Courses</h2>
      ${v.courses.length === 0
        ? html`<div class="empty" style="margin-bottom:24px"><p>No courses yet. Enroll them in one below${r.audience === "customer" ? "" : ", or they can start any open course"}.</p></div>`
        : html`<div class="panel table-wrap" style="padding:8px 12px;margin-bottom:24px"><table class="table">
          <thead><tr><th>Course</th><th>Progress</th><th></th></tr></thead>
          <tbody>${v.courses.map((c) => html`<tr>
            <td><b>${c.title}</b><div class="row small" style="gap:6px;margin-top:4px">
              ${c.enrolled ? (c.via_group ? html`<span class="muted">Through their group</span>` : html`<span class="muted">Enrolled</span>`) : html`<span class="muted">Started on their own</span>`}
              ${dueBadge(c.due_on, !!c.certificate)}</div></td>
            <td style="min-width:150px"><div class="bar"><i style="width:${c.required ? Math.round((c.done / c.required) * 100) : 0}%"></i></div>
              <span class="small muted">${c.done} of ${c.required}</span>
              ${c.certificate ? html`<br><a class="small" href="/verify/${c.certificate}">${icon.award} Certificate</a>` : ""}</td>
            <td style="text-align:right">
              <details class="menu"><summary class="btn small ghost">Actions</summary><div class="menu-body">
                ${c.enrolled && !c.via_group ? html`<form method="post" action="/edit/learners/${id}/unenrol" data-confirm="Take ${r.name || r.email} out of ${c.title}? Their progress is kept."><input type="hidden" name="course" value="${c.course_id}"><button class="btn small ghost">Take out of course</button></form>` : ""}
                ${nav.admin ? html`
                  ${c.certificate ? "" : html`<form method="post" action="/edit/learners/${id}/complete" data-confirm="Mark ${c.title} as finished for ${r.name || r.email}? They get the certificate."><input type="hidden" name="course" value="${c.course_id}"><button class="btn small ghost">${icon.check} Mark as finished</button></form>`}
                  ${c.certificate ? html`<form method="post" action="/edit/learners/${id}/revoke" data-confirm="Withdraw this certificate? Its link stops working."><input type="hidden" name="code" value="${c.certificate}"><button class="btn small ghost danger">Withdraw certificate</button></form>` : ""}
                  <form method="post" action="/edit/learners/${id}/reset" data-confirm="Clear all progress in ${c.title} for ${r.name || r.email}, including quiz tries, coursework and the certificate? This cannot be undone."><input type="hidden" name="course" value="${c.course_id}"><button class="btn small ghost danger">Start again from zero</button></form>` : ""}
              </div></details>
            </td></tr>`)}</tbody></table></div>`}
      ${notIn.length && r.status !== "removed"
        ? html`<form method="post" action="/edit/learners/${id}/enrol" class="panel" style="margin-bottom:24px">
          <h3>Enroll in a course</h3>
          <div class="grid-2">
            <div class="field"><label for="ec">Course</label><select id="ec" name="course" required>${notIn.map((c) => html`<option value="${c.id}">${c.title}${c.published ? "" : " (draft)"}</option>`)}</select></div>
            <div class="field"><label for="ed">Due by</label><input id="ed" type="date" name="due"></div>
          </div>
          <div class="field"><label class="check"><input type="checkbox" name="notify" value="1"${v.mailOn ? raw(" checked") : raw(" disabled")}> Email them about it</label></div>
          <button class="btn">${icon.plus} Enroll</button>
        </form>`
        : ""}
      ${v.work.length
        ? html`<h2>Coursework</h2><div class="panel table-wrap" style="padding:8px 12px;margin-bottom:24px"><table class="table">
          <tbody>${v.work.map((w) => html`<tr><td><a href="/edit/marking/${w.id}"><b>${w.lesson_title}</b></a><br><span class="small muted">${w.course_title} · ${fmt(w.created_at)}</span></td><td style="text-align:right">${markBadge(w.status)}</td></tr>`)}</tbody>
        </table></div>`
        : ""}
      ${v.changes.length
        ? html`<h2>Changes</h2><div class="panel table-wrap" style="padding:8px 12px"><table class="table"><tbody>
          ${v.changes.map((a) => html`<tr><td class="small" style="white-space:nowrap">${fmtTime(a.at)}</td><td><b>${a.action}</b> <span class="small muted">${detailText(a.detail)}</span></td><td class="small muted">${a.actor}</td></tr>`)}
        </tbody></table></div>`
        : ""}
    </div>
    <aside>
      <div class="panel">
        <h3>Group</h3>
        <form method="post" action="/edit/learners/${id}/group">
          <div class="field"><select name="group" aria-label="Group"><option value="">No group</option>${v.groups.map((g) => html`<option value="${g.id}"${selected(r.group_id === g.id)}>${g.name}</option>`)}</select>
            <span class="hint">They get the group's courses.</span></div>
          <button class="btn small">Save</button>
        </form>
      </div>
      <div class="panel" style="margin-top:20px">
        <h3>Access</h3>
        ${r.status === "invited" ? html`<form method="post" action="/edit/learners/${id}/resend" style="margin-bottom:12px"><button class="btn small">${icon.mail} Send the invite again</button></form>` : ""}
        ${r.status === "removed"
          ? html`<p class="small muted" style="margin-top:0">They cannot open any course.</p>${nav.admin ? html`<form method="post" action="/edit/learners/${id}/restore"><button class="btn small">Give access back</button></form>` : ""}`
          : nav.admin
            ? html`<form method="post" action="/edit/learners/${id}/remove" data-confirm="Remove ${r.name || r.email}? They lose access to every course. Their progress and certificates are kept."><button class="btn small danger">${icon.x} Remove access</button></form>`
            : html`<p class="small muted" style="margin:0">Only admins can remove people.</p>`}
      </div>
    </aside>
  </div>
</div>`;
};

export const detailText = (d: Record<string, unknown>) =>
  Object.entries(d)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
    .join(" · ");

// ----- Groups -----

export const groupsPage = (groups: Group[], nav: Nav, flash?: string, error?: string) => html`
<div class="wrap">
  ${head("Groups", "groups", nav)}
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      ${groups.length === 0
        ? html`<div class="empty"><h2>No groups yet</h2><p>A group gets courses as one: give the group a course and everyone in it, now and later, is enrolled.</p></div>`
        : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table">
          <thead><tr><th>Group</th><th>People</th><th>Courses</th></tr></thead>
          <tbody>${groups.map((g) => html`<tr><td><a href="/edit/groups/${g.id}"><b>${g.name}</b></a></td><td>${g.members}</td>
            <td class="small">${g.courses.length ? g.courses.map((c) => c.title).join(", ") : html`<span class="muted">None</span>`}</td></tr>`)}</tbody>
        </table></div>`}
    </div>
    <aside class="panel">
      <h3>New group</h3>
      <form method="post" action="/edit/groups">
        <div class="field"><label for="gn">Name</label><input id="gn" type="text" name="name" required maxlength="80" placeholder="Retail partners"></div>
        <button class="btn primary">${icon.plus} Make group</button>
      </form>
    </aside>
  </div>
</div>`;

export const groupPage = (g: Group, members: LearnerRow[], courses: Course[], mailOn: boolean, nav: Nav, flash?: string, error?: string) => {
  const notIn = courses.filter((c) => !g.courses.some((x) => x.course_id === c.id));
  return html`
<div class="wrap">
  ${head(g.name, "groups", nav, html`<a href="/edit/groups">Groups</a>`)}
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      <h2>Courses</h2>
      ${g.courses.length === 0
        ? html`<p class="muted">No courses yet.</p>`
        : html`<div class="panel table-wrap" style="padding:8px 12px;margin-bottom:20px"><table class="table"><tbody>
          ${g.courses.map((c) => html`<tr><td><b>${c.title}</b></td><td class="small">${c.due_on ? `Due ${fmt(c.due_on)}` : html`<span class="muted">No due date</span>`}</td>
            <td style="text-align:right"><form method="post" action="/edit/groups/${g.id}/unenrol" class="inline" data-confirm="Take the group out of ${c.title}? People enrolled on their own stay in it."><input type="hidden" name="course" value="${c.course_id}"><button class="btn small ghost">Take out</button></form></td></tr>`)}
        </tbody></table></div>`}
      ${notIn.length
        ? html`<form method="post" action="/edit/groups/${g.id}/enrol" class="panel" style="margin-bottom:24px">
          <div class="grid-2">
            <div class="field"><label for="gc">Course</label><select id="gc" name="course">${notIn.map((c) => html`<option value="${c.id}">${c.title}${c.published ? "" : " (draft)"}</option>`)}</select></div>
            <div class="field"><label for="gd">Due by</label><input id="gd" type="date" name="due"></div>
          </div>
          <div class="field"><label class="check"><input type="checkbox" name="notify" value="1"${mailOn ? raw(" checked") : raw(" disabled")}> Email everyone in the group</label></div>
          <button class="btn">${icon.plus} Give the group this course</button>
        </form>`
        : ""}
      <h2>People</h2>
      ${members.length === 0
        ? html`<p class="muted">No one yet. Pick this group when you add learners, or on a person's page.</p>`
        : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table"><tbody>
          ${members.map((m) => html`<tr><td><a href="/edit/learners/${encodeURIComponent(m.user_id)}"><b>${m.name || m.email}</b></a><br><span class="small muted">${m.email}</span></td><td>${statusBadge(m.status)}</td></tr>`)}
        </tbody></table></div>`}
    </div>
    <aside class="panel">
      <h3>Name</h3>
      <form method="post" action="/edit/groups/${g.id}">
        <div class="field"><input type="text" name="name" value="${g.name}" required maxlength="80" aria-label="Group name"></div>
        <button class="btn small">Save</button>
      </form>
      <hr class="rule">
      <form method="post" action="/edit/groups/${g.id}/delete" data-confirm="Delete ${g.name}? Its people stay, without a group, and lose the courses they had only through it.">
        <button class="btn small danger">${icon.trash} Delete group</button>
      </form>
    </aside>
  </div>
</div>`;
};

// ----- Marking -----

export const markingPage = (items: QueueItem[], which: "waiting" | "marked", waiting: number, nav: Nav) => html`
<div class="wrap" style="padding-bottom:80px">
  ${head("To mark", "marking", nav)}
  <div class="tabs" role="tablist" style="margin-bottom:16px">
    <a role="tab" class="tab" aria-selected="${String(which === "waiting")}" href="/edit/marking">Waiting (${waiting})</a>
    <a role="tab" class="tab" aria-selected="${String(which === "marked")}" href="/edit/marking?show=marked">Marked</a>
  </div>
  ${items.length === 0
    ? html`<div class="empty"><h2>${which === "waiting" ? "Nothing to mark" : "Nothing marked yet"}</h2><p>${which === "waiting" ? "Work that learners hand in for assignments shows up here." : "Marked work shows up here."}</p></div>`
    : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table">
      <thead><tr><th>Learner</th><th>Assignment</th><th>${which === "waiting" ? "Handed in" : "Marked"}</th><th></th></tr></thead>
      <tbody>${items.map((w) => html`<tr>
        <td><b>${w.learner_name || w.learner_email}</b><br><span class="small muted">${w.learner_email}</span></td>
        <td>${w.lesson_title}<br><span class="small muted">${w.course_title} · ${plural(w.files.length, "file")}</span></td>
        <td class="small">${fmtTime(which === "waiting" ? w.created_at : w.marked_at ?? w.created_at)}${which === "marked" ? html`<br>${markBadge(w.status)}` : ""}</td>
        <td style="text-align:right"><a class="btn small ${which === "waiting" ? "primary" : ""}" href="/edit/marking/${w.id}">${which === "waiting" ? "Mark" : "Open"}</a></td>
      </tr>`)}</tbody></table></div>`}
</div>`;

export const fileList = (files: { id: string; name: string; size: number }[]) => html`
<ul class="files">${files.map((f) => html`<li><a href="/files/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">${icon.file}<span>${f.name}</span></a><span class="small muted">${bytes(f.size)}</span></li>`)}</ul>`;

export const submissionPage = (w: QueueItem, earlier: Submission[], nav: Nav, flash?: string, error?: string) => html`
<div class="wrap" style="padding-bottom:80px">
  ${head(w.lesson_title, "marking", nav, html`<a href="/edit/marking">To mark</a>`)}
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      <div class="panel">
        <div class="spread"><div><b>${w.learner_name || w.learner_email}</b><div class="small muted">${w.course_title} · handed in ${fmtTime(w.created_at)}</div></div>${markBadge(w.status)}</div>
        ${w.note ? html`<blockquote class="note">${w.note}</blockquote>` : html`<p class="small muted">No note.</p>`}
        ${fileList(w.files)}
      </div>
      ${earlier.length
        ? html`<h3 style="margin-top:28px">Earlier tries</h3>${earlier.map((s) => html`<div class="panel" style="margin-bottom:12px">
          <div class="spread"><span class="small muted">${fmtTime(s.created_at)}</span>${markBadge(s.status)}</div>
          ${s.feedback ? html`<p class="small"><b>Feedback:</b> ${s.feedback}</p>` : ""}${fileList(s.files)}</div>`)}`
        : ""}
    </div>
    <aside class="panel">
      <h3>${w.status === "submitted" ? "Your mark" : "Change the mark"}</h3>
      <form method="post" action="/edit/marking/${w.id}">
        <div class="field"><label for="fb">Feedback</label><textarea id="fb" name="feedback" maxlength="5000" placeholder="What was good, what to change">${w.feedback}</textarea>
          <span class="hint">The learner sees this.</span></div>
        <div class="row">
          <button class="btn primary" name="verdict" value="passed">${icon.check} Pass</button>
          <button class="btn" name="verdict" value="redo">Try again</button>
        </div>
      </form>
      ${w.marked_by ? html`<p class="small muted" style="margin-bottom:0">Marked by ${w.marked_by}${w.marked_at ? `, ${fmtTime(w.marked_at)}` : ""}.</p>` : ""}
      <hr class="rule">
      <a class="small" href="/edit/learners/${encodeURIComponent(w.user_id)}">All of ${w.learner_name || w.learner_email}'s training</a>
    </aside>
  </div>
</div>`;

// ----- Change log -----

const subjectLink = (a: AuditRow) =>
  a.subject.startsWith("group:")
    ? html`<a href="/edit/groups/${a.subject.slice(6)}">Group</a>`
    : a.subject
      ? html`<a href="/edit/learners/${encodeURIComponent(a.subject)}">Person</a>`
      : "";

export const logPage = (rows: AuditRow[], nav: Nav) => html`
<div class="wrap" style="padding-bottom:80px">
  ${head("Change log", "log", nav)}
  ${rows.length === 0
    ? html`<div class="empty"><h2>No changes yet</h2><p>Invites, enrollments, marks and other changes to people show up here.</p></div>`
    : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table">
      <thead><tr><th>When</th><th>Who</th><th>What</th><th></th></tr></thead>
      <tbody>${rows.map((a) => html`<tr><td class="small" style="white-space:nowrap">${fmtTime(a.at)}</td><td class="small">${a.actor}</td>
        <td><b>${a.action}</b><br><span class="small muted">${detailText(a.detail)}</span></td><td class="small">${subjectLink(a)}</td></tr>`)}</tbody></table></div>
      ${rows.length === 100 ? html`<p><a class="btn small" href="/edit/log?before=${rows[rows.length - 1].id}">Older</a></p>` : ""}`}
</div>`;

export { day };
