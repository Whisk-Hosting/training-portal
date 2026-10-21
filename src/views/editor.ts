import { html, raw } from "hono/html";
import { duration, plural, type Course, type Lesson, type Module, type ModuleOutline, type Question } from "../model.js";
import { icon, kindIcon, kindLabel } from "./icons.js";
import { notice } from "./layout.js";
import { editNav, type Nav } from "./nav.js";

const fmt = (d: Date) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
const checked = (on: boolean) => (on ? raw(" checked") : "");
const selected = (on: boolean) => (on ? raw(" selected") : "");

const moveButtons = (action: string, what: string) => html`
<form method="post" action="${action}" class="inline"><input type="hidden" name="dir" value="up"><button class="icon-btn" title="Move ${what} up" aria-label="Move ${what} up">${icon.up}</button></form>
<form method="post" action="${action}" class="inline"><input type="hidden" name="dir" value="down"><button class="icon-btn" title="Move ${what} down" aria-label="Move ${what} down">${icon.down}</button></form>`;

export type CourseRow = Course & { lessons: number; learners: number };

export const editHome = (rows: CourseRow[], nav: Nav, flash?: string, error?: string) => html`
<div class="wrap">
  <section class="page-head"><h1>Courses</h1>${editNav("courses", nav)}</section>
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      ${rows.length === 0
        ? html`<div class="empty"><h2>No courses yet</h2><p>Give your first course a name to begin.</p></div>`
        : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table">
          <thead><tr><th>Course</th><th>Lessons</th><th>Learners</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((c) => html`<tr>
            <td><a href="/edit/courses/${c.id}" style="font-weight:650;text-decoration:none">${c.title}</a></td>
            <td>${c.lessons}</td><td>${c.learners}</td>
            <td>${c.published ? html`<span class="badge good">Live</span>` : html`<span class="badge">Draft</span>`}${c.access === "enrolled" ? html` <span class="badge">Invite only</span>` : ""}</td>
            <td style="text-align:right;white-space:nowrap">${moveButtons(`/edit/courses/${c.id}/move`, "course")}</td>
          </tr>`)}</tbody></table></div>`}
    </div>
    <aside class="panel">
      <h3>New course</h3>
      <form method="post" action="/edit/courses">
        <div class="field"><label for="ct">Name</label><input id="ct" type="text" name="title" required maxlength="120" placeholder="Ordering online with us"></div>
        <div class="field"><label for="cs">One-line summary</label><textarea id="cs" name="summary" style="min-height:80px" maxlength="400"></textarea></div>
        <button class="btn primary">${icon.plus} Make course</button>
      </form>
    </aside>
  </div>
</div>`;

export const editCourse = (c: Course, o: ModuleOutline[], flash?: string, error?: string) => html`
<div class="wrap">
  <section class="page-head">
    <div class="crumbs"><a href="/edit">Edit</a><span>/</span><span>Course</span></div>
    <div class="spread"><h1 style="margin:0">${c.title}</h1>
      <div class="row">${c.published ? html`<span class="badge good">Live</span>` : html`<span class="badge">Draft</span>`}<a class="btn small" href="/courses/${c.slug}">${icon.eye} View</a></div></div>
  </section>
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      ${o.map((m) => html`<section class="ed-module" id="module-${m.id}">
        <header>
          <span class="badge">Module ${m.number}</span>
          <h3>${m.title}</h3>
          ${moveButtons(`/edit/modules/${m.id}/move`, "module")}
          <form method="post" action="/edit/modules/${m.id}/delete" class="inline" data-confirm="Delete the module ${m.title} and its ${plural(m.lessons.length, "lesson")}? Learners lose their progress in them."><button class="icon-btn" title="Delete module" aria-label="Delete module">${icon.trash}</button></form>
        </header>
        <details style="padding:0 20px"><summary class="small muted" style="padding:10px 0;cursor:pointer">Rename or describe this module</summary>
          <form method="post" action="/edit/modules/${m.id}" style="padding-bottom:12px">
            <div class="field"><label>Name</label><input type="text" name="title" value="${m.title}" required maxlength="120"></div>
            <div class="field"><label>Summary</label><textarea name="summary" style="min-height:70px" maxlength="600">${m.summary}</textarea></div>
            <button class="btn small">Save module</button>
          </form>
        </details>
        ${m.lessons.map((l) => html`<div class="ed-lesson ${l.depth === 1 ? "sub" : ""}">
          <a class="title" href="/edit/lessons/${l.id}"><span class="muted">${kindIcon(l.kind)}</span><span>${l.title}</span>
            ${l.optional ? html`<span class="badge">Optional</span>` : ""}
            ${l.kind === "video" && !l.video_upload_id ? html`<span class="badge">No video</span>` : ""}</a>
          <span class="small muted">${duration(l.minutes)}</span>
          ${moveButtons(`/edit/lessons/${l.id}/move`, "lesson")}
        </div>`)}
        <div class="ed-add"><form method="post" action="/edit/modules/${m.id}/lessons">
          <input type="text" name="title" required maxlength="120" placeholder="New lesson name" aria-label="New lesson name">
          <select name="kind" aria-label="Kind"><option value="read">Lesson</option><option value="video">Video</option><option value="quiz">Quiz</option><option value="assignment">Assignment</option></select>
          <button class="btn small">${icon.plus} Add</button>
        </form></div>
      </section>`)}
      <section class="panel">
        <h3>Add a module</h3>
        <form method="post" action="/edit/courses/${c.id}/modules" class="row">
          <input type="text" name="title" required maxlength="120" placeholder="Module name" aria-label="Module name" style="flex:1;min-width:200px">
          <button class="btn">${icon.plus} Add module</button>
        </form>
      </section>
    </div>
    <aside class="panel">
      <h3>Course details</h3>
      <form method="post" action="/edit/courses/${c.id}">
        <div class="field"><label for="t">Name</label><input id="t" type="text" name="title" value="${c.title}" required maxlength="120"></div>
        <div class="field"><label for="sl">Web address</label><input id="sl" type="text" name="slug" value="${c.slug}" required maxlength="60" pattern="[a-z0-9-]+"><span class="hint">/courses/${c.slug}</span></div>
        <div class="field"><label for="su">Summary</label><textarea id="su" name="summary" maxlength="400">${c.summary}</textarea></div>
        <div class="field"><label for="acc">Who can take it</label>
          <select id="acc" name="access"><option value="open"${selected(c.access === "open")}>Every learner</option><option value="enrolled"${selected(c.access === "enrolled")}>Only people enrolled</option></select>
          <span class="hint">Enroll people or groups from Learners and Groups.</span></div>
        <div class="field"><label class="check"><input type="checkbox" name="published" value="1"${checked(c.published)}> Live for learners</label></div>
        <button class="btn primary">Save</button>
      </form>
      <hr class="rule">
      <form method="post" action="/edit/courses/${c.id}/delete" data-confirm="Delete ${c.title}, its lessons, its learners' progress and certificates? This cannot be undone.">
        <button class="btn small danger">${icon.trash} Delete course</button>
      </form>
    </aside>
  </div>
</div>`;

const questionForm = (action: string, q: Partial<Question>, label: string) => {
  const choices = [...(q.choices ?? []), ...Array(6).fill({ text: "", correct: false })].slice(0, Math.max(4, (q.choices?.length ?? 0) + 1)).slice(0, 6);
  return html`<form method="post" action="${action}">
    <div class="field"><label>Question</label><textarea name="prompt" style="min-height:70px" required maxlength="1000">${q.prompt ?? ""}</textarea></div>
    <div class="label" style="margin-bottom:8px">Answers <span class="muted small">(pick the correct one; leave spare boxes empty)</span></div>
    ${choices.map((ch, i) => html`<div class="ed-choice"><input type="radio" name="correct" value="${i}" aria-label="Answer ${i + 1} is correct"${checked(ch.correct)}><input type="text" name="choice" value="${ch.text}" maxlength="300" placeholder="Answer ${i + 1}" aria-label="Answer ${i + 1}"></div>`)}
    <div class="field" style="margin-top:12px"><label>Why (shown after answering)</label><textarea name="explanation" style="min-height:60px" maxlength="1500">${q.explanation ?? ""}</textarea></div>
    <button class="btn small">${label}</button>
  </form>`;
};

export const editLesson = (c: Course, m: Module, l: Lesson, qs: Question[], flash?: string, error?: string) => html`
<div class="wrap">
  <section class="page-head">
    <div class="crumbs"><a href="/edit">Edit</a><span>/</span><a href="/edit/courses/${c.id}">${c.title}</a><span>/</span><span>${m.title}</span></div>
    <div class="spread"><h1 style="margin:0">${l.title}</h1><a class="btn small" href="/learn/${c.slug}/${l.slug}">${icon.eye} View as learner</a></div>
  </section>
  ${notice("good", flash)}${notice("error", error)}
  <div class="editor">
    <div>
      <form method="post" action="/edit/lessons/${l.id}" id="lesson-form" class="panel">
        <div class="field"><label for="lt">Name</label><input id="lt" type="text" name="title" value="${l.title}" required maxlength="120"></div>
        <div class="field" data-preview>
          <div class="spread"><label for="lb">${l.kind === "quiz" ? "Introduction" : l.kind === "video" ? "Notes under the video" : l.kind === "assignment" ? "What to hand in" : "Lesson"} <span class="muted small">(Markdown)</span></label>
            <div class="tabs" role="tablist"><button type="button" data-tab="write" aria-selected="true">Write</button><button type="button" data-tab="preview" aria-selected="false">Preview</button></div></div>
          <textarea id="lb" class="code" name="body" maxlength="100000">${l.body}</textarea>
          <div class="preview prose" hidden></div>
          <span class="hint">## Heading · **bold** · [link](https://…) · - list · &gt; tip · ![picture](https://…)</span>
        </div>
        <button class="btn primary">Save lesson</button>
      </form>
      ${l.kind === "video" ? html`<section class="panel" style="margin-top:24px">
        <h3>Video</h3>
        ${l.video_upload_id ? html`<script src="/.whisk/player.js" defer></script><div class="video" style="margin-bottom:16px"><whisk-video media="${l.video_upload_id}"></whisk-video></div>` : ""}
        <div class="upload-box" data-upload="${l.id}">
          <label class="btn" style="cursor:pointer">${icon.upload} ${l.video_upload_id ? "Replace the video" : "Upload a video"}<input type="file" accept="video/*,audio/*" class="sr"></label>
          <p class="status small muted" style="margin:10px 0 0">MP4 or MOV, up to 5 GB. It plays on every phone and browser once uploaded.</p>
          <div class="bar" hidden><i style="width:0%"></i></div>
        </div>
      </section>` : ""}
      ${l.kind === "assignment" ? html`<section class="panel" style="margin-top:24px">
        <h3>Coursework</h3>
        <p class="small muted" style="margin:0">Learners upload files here and a trainer marks them pass or try again under <a href="/edit/marking">To mark</a>. A pass finishes the lesson.</p>
      </section>` : ""}
      ${l.kind === "quiz" ? html`<section style="margin-top:24px">
        <h2>Questions</h2>
        ${qs.length === 0 ? html`<p class="muted">No questions yet. Add the first one below.</p>` : ""}
        ${qs.map((q, i) => html`<div class="ed-question">
          <div class="spread" style="margin-bottom:8px"><span class="badge">Question ${i + 1}</span><span>
            ${moveButtons(`/edit/questions/${q.id}/move`, "question")}
            <form method="post" action="/edit/questions/${q.id}/delete" class="inline" data-confirm="Delete this question?"><button class="icon-btn" title="Delete question" aria-label="Delete question">${icon.trash}</button></form>
          </span></div>
          ${questionForm(`/edit/questions/${q.id}`, q, "Save question")}
        </div>`)}
        <div class="ed-question" style="border-style:dashed"><h3>New question</h3>${questionForm(`/edit/lessons/${l.id}/questions`, {}, "Add question")}</div>
      </section>` : ""}
    </div>
    <aside class="panel">
      <h3>Settings</h3>
      <div class="field"><label for="lk">Kind</label>
        <select id="lk" name="kind" form="lesson-form">
          ${(["read", "video", "quiz", "assignment"] as const).map((k) => html`<option value="${k}"${selected(l.kind === k)}>${kindLabel(k)}</option>`)}
        </select></div>
      <div class="grid-2">
        <div class="field"><label for="lm">Minutes</label><input id="lm" type="number" name="minutes" min="0" max="600" value="${l.minutes}" form="lesson-form"></div>
        ${l.kind === "quiz" ? html`<div class="field"><label for="lp">Pass mark %</label><input id="lp" type="number" name="pass_mark" min="0" max="100" value="${l.pass_mark}" form="lesson-form"></div>` : ""}
      </div>
      <div class="field"><label for="ls">Web address</label><input id="ls" type="text" name="slug" value="${l.slug}" required maxlength="60" pattern="[a-z0-9-]+" form="lesson-form"></div>
      <div class="field"><label class="check"><input type="checkbox" name="depth" value="1" form="lesson-form"${checked(l.depth === 1)}> Tuck under the lesson above</label></div>
      <div class="field"><label class="check"><input type="checkbox" name="optional" value="1" form="lesson-form"${checked(l.optional)}> Optional (not needed to finish)</label></div>
      <button class="btn primary" form="lesson-form">Save lesson</button>
      <hr class="rule">
      <form method="post" action="/edit/lessons/${l.id}/delete" data-confirm="Delete ${l.title}? Learners lose their progress in it.">
        <button class="btn small danger">${icon.trash} Delete lesson</button>
      </form>
    </aside>
  </div>
</div>`;

