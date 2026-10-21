import { html, raw } from "hono/html";
import { markdown } from "../markdown.js";
import { courseMinutes, duration, flatLessons, maxFiles, plural, type Course, type Graded, type Lesson, type ModuleOutline, type Progress, type Question } from "../model.js";
import type { Attempt, Certificate, Settings, Submission } from "../store.js";
import { dueBadge, fileList, markBadge } from "./people.js";
import { icon, kindIcon, kindLabel } from "./icons.js";
import { notice, type Html } from "./layout.js";

export const lessonHref = (courseSlug: string, l: Lesson) => `/learn/${courseSlug}/${l.slug}`;

const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

const bar = (percent: number) => html`<div class="bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div>`;

// thread draws a module's lessons on a line. Done lessons fill the line; the open lesson pops out.
export const thread = (courseSlug: string, lessons: Lesson[], done: ReadonlySet<number>, opts: { current?: number; badge?: { lesson?: number; text: string } } = {}) => html`
<ol class="thread">
  ${lessons.map((l) => {
    const cls = [done.has(l.id) && "done", l.id === opts.current && "current", l.depth === 1 && "sub", l.optional && "optional"].filter(Boolean).join(" ");
    return html`<li class="${cls}">
      <span class="dot">${done.has(l.id) ? icon.check : ""}</span>
      <a class="item" href="${lessonHref(courseSlug, l)}"${l.id === opts.current ? raw(' aria-current="page"') : ""}>
        <span>${l.title}</span>
        ${opts.badge?.lesson === l.id ? html`<span class="badge accent">${opts.badge.text}</span>` : ""}
        <span class="grow"></span>
        ${l.kind !== "read" ? html`<span class="kind" title="${kindLabel(l.kind)}">${kindIcon(l.kind)}</span>` : ""}
        ${done.has(l.id) ? html`<span class="sr">(done)</span>` : ""}
      </a>
    </li>`;
  })}
</ol>`;

// ----- Home -----

export type CourseCard = Course & { lessons: number; minutes: number; progress?: Progress; enrolled: boolean; due: Date | null };

export const home = (s: Settings, cards: CourseCard[], editor: boolean) => html`
<div class="wrap">
  <section class="hero">
    <h1>${s.portal_name}</h1>
    ${s.tagline ? html`<p class="lead">${s.tagline}</p>` : ""}
  </section>
  ${cards.length === 0
    ? html`<div class="empty" style="margin-bottom:80px">
        <h2>No courses yet</h2>
        <p>${editor ? "Start your first course in the editor." : "Courses will appear here once they are ready."}</p>
        ${editor ? html`<a class="btn primary" href="/edit">${icon.plus} Make a course</a>` : ""}
      </div>`
    : html`<div class="course-grid">
        ${cards.map((c) => html`<a class="course-card" href="/courses/${c.slug}">
          <div class="row">${c.published ? "" : html`<span class="badge">Draft</span>`}${c.progress?.complete ? html`<span class="badge good">${icon.check} Done</span>` : c.enrolled ? html`<span class="badge accent">Assigned to you</span>` : ""}${dueBadge(c.due, !!c.progress?.complete)}</div>
          <h2>${c.title}</h2>
          <p>${c.summary}</p>
          <div class="meta"><span>${icon.read} ${plural(c.lessons, "lesson")}</span><span>${icon.clock} ${duration(c.minutes)}</span></div>
          ${c.progress?.started ? html`<div>${bar(c.progress.percent)}<div class="small muted" style="margin-top:6px">${c.progress.percent}% done</div></div>` : ""}
        </a>`)}
      </div>`}
</div>`;

// ----- Course page -----

// Access is what the person may do with the course: take it, sign in first, or neither.
export type CourseAccess = "ok" | "signin" | "not-enrolled" | "removed";

const lockText: Record<Exclude<CourseAccess, "ok">, string> = {
  signin: "Sign in to start",
  "not-enrolled": "This course is for people enrolled in it. Ask your contact to add you.",
  removed: "Your access to this portal has been removed.",
};

export const coursePage = (c: Course, o: ModuleOutline[], done: ReadonlySet<number>, p: Progress, signedIn: boolean, editor: boolean, access: CourseAccess = "ok", due: Date | null = null) => {
  const all = flatLessons(o);
  const ctaLesson = p.next ?? all[0];
  const badge = ctaLesson ? { lesson: ctaLesson.id, text: p.started ? "Up next" : "Start here" } : undefined;
  return html`
<div class="wrap">
  <section class="course-hero">
    <div>
      <div class="row" style="margin-bottom:12px">${c.published ? "" : html`<span class="badge">Draft: only staff can see this</span>`}${c.access === "enrolled" ? html`<span class="badge">${icon.lock} Invite only</span>` : ""}${dueBadge(due, p.complete)}</div>
      <h1>${c.title}</h1>
      <p class="lead">${c.summary}</p>
      <div class="meta"><span>${icon.read} ${plural(o.length, "module")} · ${plural(all.length, "lesson")}${all.length > p.required ? ` (${all.length - p.required} optional)` : ""}</span><span>${icon.clock} ${duration(courseMinutes(o))}</span></div>
    </div>
    <div class="cta">
      ${signedIn && p.started ? html`<div class="row"><div class="ring" style="--p:${p.percent}"><b>${p.percent}%</b></div><div class="small muted">${p.done} of ${p.required}<br>lessons done</div></div>` : ""}
      ${access === "signin"
        ? html`<a class="btn primary" href="/.whisk/login?return=${encodeURIComponent(`/courses/${c.slug}`)}">${c.access === "enrolled" ? "Sign in" : "Sign in to start"} ${icon.right}</a>`
        : access !== "ok"
          ? html`<p class="lock-note">${icon.lock} ${lockText[access]}</p>`
          : ctaLesson
        ? p.complete
          ? html`<a class="btn primary" href="/learn/${c.slug}/complete">${icon.award} See your certificate</a>`
          : html`<a class="btn primary" href="${lessonHref(c.slug, ctaLesson)}">${p.started ? "Continue" : "Start the course"} ${icon.right}</a>`
        : ""}
      ${editor ? html`<a class="btn ghost small" href="/edit/courses/${c.id}">${icon.edit} Edit course</a>` : ""}
    </div>
  </section>
  ${o.length === 0
    ? html`<div class="empty" style="margin-bottom:80px"><h2>No lessons yet</h2><p>This course has no lessons yet.</p></div>`
    : html`<div class="modules">
      ${o.map((m) => {
        const doneHere = m.lessons.filter((l) => done.has(l.id)).length;
        return html`<section class="module-card" aria-labelledby="m${m.id}">
          <div class="info">
            <span class="kicker">Module ${m.number}</span>
            <h2 id="m${m.id}">${m.title}</h2>
            ${m.summary ? html`<p>${m.summary}</p>` : ""}
            <div class="meta" style="margin-top:auto;padding-top:12px">
              <span>${plural(m.lessons.length, "lesson")}</span>
              <span>${icon.clock} ${duration(m.lessons.reduce((t, l) => t + l.minutes, 0))}</span>
              ${signedIn && doneHere > 0 ? html`<span>${icon.check} ${doneHere} done</span>` : ""}
            </div>
          </div>
          <div class="lessons">
            ${m.lessons.length ? thread(c.slug, m.lessons, done, { badge }) : html`<p class="muted">No lessons in this module yet.</p>`}
          </div>
        </section>`;
      })}
    </div>`}
</div>`;
};

// ----- Lesson page -----

type LessonView = {
  course: Course;
  outline: ModuleOutline[];
  lesson: Lesson;
  done: ReadonlySet<number>;
  progress: Progress;
  prev?: Lesson;
  next?: Lesson;
  editor: boolean;
  quiz?: Html;
  coursework?: Html;
  flash?: string;
};

const sideOutline = (v: LessonView) =>
  v.outline.map((m) => {
    const open = m.lessons.some((l) => l.id === v.lesson.id);
    const doneHere = m.lessons.filter((l) => v.done.has(l.id)).length;
    const count = html`<span class="count">${doneHere}/${m.lessons.length}</span>`;
    if (open)
      return html`<div class="side-module open"><div class="head"><span>${m.number}. ${m.title}</span>${count}</div>${thread(v.course.slug, m.lessons, v.done, { current: v.lesson.id })}</div>`;
    const first = m.lessons[0];
    return first
      ? html`<div class="side-module"><a href="${lessonHref(v.course.slug, first)}"><span>${m.number}. ${m.title}</span>${count}</a></div>`
      : "";
  });

export const lessonPage = (v: LessonView) => {
  const mod = v.outline.find((m) => m.lessons.some((l) => l.id === v.lesson.id))!;
  const index = mod.lessons.findIndex((l) => l.id === v.lesson.id);
  const isDone = v.done.has(v.lesson.id);
  // One button finishes the lesson and moves on, so there is no separate Next beside it.
  const canMarkDone = !isDone && v.lesson.kind !== "quiz" && v.lesson.kind !== "assignment";
  return html`
<div class="wrap lesson-layout">
  <aside class="sidebar" aria-label="Course outline">
    <a class="course-link" href="/courses/${v.course.slug}">${v.course.title}</a>
    <div class="small muted">${v.progress.done} of ${v.progress.required} lessons done</div>
    ${bar(v.progress.percent)}
    ${sideOutline(v)}
  </aside>
  <article class="lesson-main">
    <details class="mobile-outline">
      <summary><span>Module ${mod.number} · Lesson ${index + 1} of ${mod.lessons.length}</span><span class="muted small">${v.progress.percent}%</span></summary>
      ${thread(v.course.slug, mod.lessons, v.done, { current: v.lesson.id })}
    </details>
    <header>
      <div class="crumbs"><a href="/courses/${v.course.slug}">${v.course.title}</a><span>/</span><span>Module ${mod.number}: ${mod.title}</span></div>
      <h1>${v.lesson.title}</h1>
      <div class="meta">
        <span>${kindIcon(v.lesson.kind)} ${kindLabel(v.lesson.kind)}</span>
        <span>${icon.clock} ${duration(v.lesson.minutes)}</span>
        ${v.lesson.optional ? html`<span class="badge">Optional</span>` : ""}
        ${isDone ? html`<span class="badge good">${icon.check} Done</span>` : ""}
        ${v.editor ? html`<a class="btn ghost small" href="/edit/lessons/${v.lesson.id}">${icon.edit} Edit</a>` : ""}
      </div>
    </header>
    ${notice("good", v.flash)}
    ${v.lesson.kind === "video"
      ? v.lesson.video_upload_id
        ? html`<script src="/.whisk/player.js" defer></script><div class="video"><whisk-video media="${v.lesson.video_upload_id}"></whisk-video></div>`
        : v.editor
          ? html`<div class="video-missing"><div>No video yet. <a href="/edit/lessons/${v.lesson.id}">Upload one in the editor</a>.</div></div>`
          : ""
      : ""}
    <div class="prose">${raw(markdown(v.lesson.body))}</div>
    ${v.quiz ?? ""}
    ${v.coursework ?? ""}
    <div class="lesson-foot">
      ${isDone && v.lesson.kind !== "quiz" && v.lesson.kind !== "assignment"
        ? html`<div class="spread"><span class="done-note">${icon.check} You finished this lesson.</span>
            <form method="post" action="/learn/${v.course.slug}/${v.lesson.slug}/undo" class="inline"><button class="btn ghost small">Mark as not done</button></form></div>`
        : ""}
      <nav class="pager" aria-label="Lessons">
        ${v.prev ? html`<a class="prev" href="${lessonHref(v.course.slug, v.prev)}"><small>${icon.left} Previous</small><b>${v.prev.title}</b></a>` : ""}
        ${canMarkDone
          ? html`<form method="post" action="/learn/${v.course.slug}/${v.lesson.slug}/complete" class="next"><button class="done-next">
              <small>${icon.check} Done${v.next ? html`, next ${icon.right}` : ""}</small><b>${v.next ? v.next.title : "Finish this lesson"}</b></button></form>`
          : v.next
            ? html`<a class="next" href="${lessonHref(v.course.slug, v.next)}"><small>Next ${icon.right}</small><b>${v.next.title}</b></a>`
            : html`<a class="next" href="/courses/${v.course.slug}"><small>Back to ${icon.right}</small><b>Course outline</b></a>`}
      </nav>
    </div>
  </article>
</div>`;
};

// ----- Quiz -----

export const quizForm = (action: string, qs: Question[], passMark: number, error?: string) =>
  qs.length === 0
    ? html`<div class="notice">This quiz has no questions yet.</div>`
    : html`
<form class="quiz" id="quiz" method="post" action="${action}">
  ${notice("error", error)}
  <p class="muted">${plural(qs.length, "question")}. Get ${passMark}% or more to pass. You can try as many times as you like.</p>
  ${qs.map((q, i) => html`<div class="question"><fieldset>
    <legend><span class="num">Question ${i + 1}</span>${q.prompt}</legend>
    ${q.choices.map((c, ci) => html`<label class="choice"><input type="radio" name="q${q.id}" value="${ci}" required><span>${c.text}</span></label>`)}
  </fieldset></div>`)}
  <div><button class="btn primary">${icon.check} Check my answers</button></div>
</form>`;

export const quizResult = (retryHref: string, qs: Question[], g: Graded, passMark: number, at?: Date) => html`
<div class="quiz" id="quiz">
  <div class="score ${g.passed ? "pass" : "fail"}">
    <div class="ring" style="--p:${g.total ? Math.round((g.score / g.total) * 100) : 100}"><b>${g.score}/${g.total}</b></div>
    <div>
      <h2>${g.passed ? "You passed." : "Not quite yet."}</h2>
      <div class="muted">${g.passed ? `You needed ${passMark}%.` : `You need ${passMark}% to pass. Read the notes below and try again.`}${at ? ` Last try ${fmtDate(at)}.` : ""}</div>
    </div>
  </div>
  ${qs.map((q, i) => {
    const r = g.results.find((x) => x.questionId === q.id);
    return html`<div class="question">
      <div style="margin-bottom:10px;font-weight:650;font-size:1.05rem"><span class="num">Question ${i + 1}</span>${q.prompt}</div>
      ${q.choices.map((c, ci) => {
        const cls = ci === r?.correct ? "right" : ci === r?.chosen ? "wrong" : "";
        const tag = ci === r?.correct ? (ci === r?.chosen ? "Your answer, correct" : "Correct answer") : ci === r?.chosen ? "Your answer" : "";
        return html`<div class="choice ${cls}"><span>${c.text}</span>${tag ? html`<span class="tag">${tag}</span>` : ""}</div>`;
      })}
      ${q.explanation ? html`<div class="explain">${raw(markdown(q.explanation))}</div>` : ""}
    </div>`;
  })}
  <div class="row"><a class="btn ${g.passed ? "" : "primary"}" href="${retryHref}">Try again</a></div>
</div>`;

export const attemptGraded = (a: Attempt, qs: Question[]): Graded => ({
  score: a.score,
  total: a.total,
  passed: a.passed,
  results: qs.map((q) => {
    const chosen = a.answers[String(q.id)] ?? null;
    const correct = q.choices.findIndex((c) => c.correct);
    return { questionId: q.id, chosen, correct, right: chosen === correct };
  }),
});

// ----- Finished course -----

export const completePage = (c: Course, cert: Certificate) => html`
<canvas id="confetti" aria-hidden="true"></canvas>
<div class="wrap celebrate">
  <div class="seal">${icon.award}</div>
  <h1>You finished ${c.title}.</h1>
  <p class="lead muted">Well done, ${cert.learner_name}. Your certificate is ready.</p>
  <div class="row" style="justify-content:center">
    <a class="btn primary" href="/verify/${cert.code}">${icon.award} View certificate</a>
    <a class="btn" href="/courses/${c.slug}">Back to the course</a>
  </div>
</div>`;

// ----- My learning -----

export type MyCourse = { title: string; slug: string; done: number; required: number; certificate: string | null; next?: string; enrolled: boolean; due_on: Date | null };

export const mePage = (name: string, mine: MyCourse[], certs: Certificate[]) => html`
<div class="wrap" style="padding-bottom:80px">
  <section class="page-head"><h1>My learning</h1><p class="muted">${name}</p></section>
  ${mine.length === 0
    ? html`<div class="empty"><h2>Nothing here yet</h2><p>Pick a course to begin.</p><a class="btn primary" href="/">See the courses ${icon.right}</a></div>`
    : html`<div class="course-grid" style="padding-bottom:40px">
      ${mine.map((m) => {
        const pct = m.required ? Math.round((m.done / m.required) * 100) : 0;
        return html`<a class="course-card" href="${m.next ?? `/courses/${m.slug}`}">
          <div class="row">${m.certificate ? html`<span class="badge good">${icon.check} Done</span>` : m.done ? html`<span class="badge">In progress</span>` : html`<span class="badge accent">Not started</span>`}${dueBadge(m.due_on, !!m.certificate)}</div>
          <h2>${m.title}</h2>
          <div>${bar(pct)}<div class="small muted" style="margin-top:6px">${m.done} of ${m.required} lessons</div></div>
          <span class="row small" style="font-weight:650">${m.certificate ? "Review the course" : m.done ? "Continue" : "Start"} ${icon.right}</span>
        </a>`;
      })}
    </div>`}
  <h2>Certificates</h2>
  ${certs.length === 0
    ? html`<p class="muted">Finish a course to earn its certificate.</p>`
    : html`<div class="panel table-wrap"><table class="table">
      <thead><tr><th>Course</th><th>Issued</th><th></th></tr></thead>
      <tbody>${certs.map((c) => html`<tr><td><b>${c.course_title}</b></td><td>${fmtDate(c.issued_at)}</td><td style="text-align:right"><a class="btn small" href="/verify/${c.code}">${icon.award} View</a></td></tr>`)}</tbody>
    </table></div>`}
</div>`;

// ----- Certificate -----

export const certificatePage = (s: Settings, cert: Certificate, url: string, mine: boolean) => html`
<div class="wrap cert-page">
  <div class="certificate">
    <div>
      <div class="kicker">${s.portal_name} · Certificate of completion</div>
    </div>
    <div>
      <div class="kicker" style="letter-spacing:.1em">This certifies that</div>
      <div class="who">${cert.learner_name}</div>
      <div class="kicker" style="letter-spacing:.1em;margin-top:1em">finished the course</div>
      <div class="what">${cert.course_title}</div>
    </div>
    <div class="foot">
      <div>Issued ${fmtDate(cert.issued_at)}<br>Check it at ${url.replace(/^https?:\/\//, "")}</div>
      <div class="seal">${icon.award}</div>
    </div>
  </div>
  <div class="row no-print">
    <a class="btn primary" href="/verify/${cert.code}/pdf?download=1">${icon.download} Download PDF</a>
    <button class="btn" onclick="print()">Print</button>
    ${mine && cert.course_slug ? html`<a class="btn" href="/courses/${cert.course_slug}">Back to the course</a>` : ""}
  </div>
  <p class="muted small no-print">${icon.check} This certificate is genuine. Anyone with this link can check it.</p>
</div>`;

export const message = (title: string, text: string, link?: { href: string; label: string }) => html`
<div class="wrap" style="padding:80px 24px"><div class="empty"><h2>${title}</h2><p>${text}</p>${link ? html`<a class="btn primary" href="${link.href}">${link.label}</a>` : ""}</div></div>`;

// ----- Coursework -----

export const courseworkPanel = (p: { uploadUrl: string; submitUrl: string; subs: Submission[]; canSubmit: boolean; editor: boolean; error?: string }) => {
  const [latest, ...earlier] = p.subs;
  return html`
<section class="coursework" id="coursework">
  <h2>Your work</h2>
  ${notice("error", p.error)}
  ${latest
    ? html`<div class="panel submission">
        <div class="spread"><span class="small muted">Handed in ${fmtDate(latest.created_at)}</span>${markBadge(latest.status)}</div>
        ${latest.status === "submitted" ? html`<p style="margin:8px 0 0">A trainer will mark it. You'll get an email when they do.</p>` : ""}
        ${latest.feedback ? html`<div class="feedback"><b>Feedback</b><p>${latest.feedback}</p></div>` : ""}
        ${latest.note ? html`<p class="small"><b>Your note:</b> ${latest.note}</p>` : ""}
        ${fileList(latest.files)}
      </div>`
    : ""}
  ${p.canSubmit
    ? html`<form class="panel hand-in" method="post" action="${p.submitUrl}" data-coursework="${p.uploadUrl}">
        <h3>${latest ? "Hand in again" : "Hand in your work"}</h3>
        <div class="upload-box">
          <label class="btn" style="cursor:pointer">${icon.upload} Choose files<input type="file" multiple class="sr"></label>
          <p class="status small muted" style="margin:10px 0 0">Up to ${maxFiles} files, 200 MB each. Photos, PDFs, documents or video.</p>
        </div>
        <ul class="files pending"></ul>
        <noscript><p class="notice error">Handing in files needs JavaScript turned on.</p></noscript>
        <div class="field" style="margin-top:16px"><label for="note">Note for the trainer <span class="muted small">(optional)</span></label><textarea id="note" name="note" maxlength="5000" style="min-height:80px"></textarea></div>
        <input type="hidden" name="files" value="[]">
        <button class="btn primary" disabled>${icon.check} Hand in</button>
      </form>`
    : ""}
  ${earlier.length
    ? html`<details class="earlier"><summary class="small">Earlier tries (${earlier.length})</summary>
      ${earlier.map((s) => html`<div class="panel submission"><div class="spread"><span class="small muted">${fmtDate(s.created_at)}</span>${markBadge(s.status)}</div>
        ${s.feedback ? html`<div class="feedback"><b>Feedback</b><p>${s.feedback}</p></div>` : ""}${fileList(s.files)}</div>`)}</details>`
    : ""}
  ${p.editor ? html`<p class="small muted">Staff see this as a learner would. Handed-in work goes to <a href="/edit/marking">To mark</a>.</p>` : ""}
</section>`;
};
