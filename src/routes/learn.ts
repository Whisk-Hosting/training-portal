// What learners see: the catalog, course outlines, lessons, quizzes, coursework, their own
// progress, and certificate checks anyone can open.
import type { Context, Hono } from "hono";
import { certificatePdf } from "../certificate.js";
import { courseRef, emit, learnerRef, lessonRef } from "../events.js";
import { courseMinutes, courseProgress, courseworkState, fileProblems, flatLessons, grade, maxFileBytes, neighbors, slugify, type Course } from "../model.js";
import { finished, handIn, lessonDone } from "../people.js";
import * as store from "../store.js";
import type { Html } from "../views/layout.js";
import { attemptGraded, certificatePage, completePage, coursePage, courseworkPanel, home, lessonHref, lessonPage, message, mePage, quizForm, quizResult, type CourseAccess, type MyCourse } from "../views/pages.js";
import { flash, learnerName, mayOpen, notFound, removedPage, render, signedIn, text, viewerOf, who } from "../web.js";
import { canEdit, env, log, whiskApi, type Identity } from "../whisk.js";

export const learnRoutes = (app: Hono) => {
  app.get("/", async (c) => {
    const id = who(c);
    const editor = canEdit(id);
    if (signedIn(id)) await store.seen(id);
    const v = await viewerOf(id);
    if (v.status === "removed" && !editor) return removedPage(c);
    const [s, list, done] = await Promise.all([store.settings(), store.courses(editor), store.completedAll(id.userId)]);
    // Signed-out visitors see the open courses; invite-only ones stay private.
    const visible = list.filter((co) => editor || (signedIn(id) ? mayOpen(co, v) : co.access === "open"));
    const cards = await Promise.all(
      visible.map(async (course) => {
        const o = await store.courseOutline(course.id);
        return {
          ...course,
          lessons: flatLessons(o).length,
          minutes: courseMinutes(o),
          progress: id.userId ? courseProgress(o, done) : undefined,
          enrolled: v.enrolled.has(course.id),
          due: v.enrolled.get(course.id) ?? null,
        };
      }),
    );
    cards.sort((a, b) => Number(b.enrolled && !b.progress?.complete) - Number(a.enrolled && !a.progress?.complete));
    return render(c, s.portal_name, home(s, cards, editor), { nav: "courses" });
  });

  app.get("/courses/:slug", async (c) => {
    const id = who(c);
    const course = await store.courseBySlug(c.req.param("slug"), canEdit(id));
    if (!course) return notFound(c, "course");
    const v = await viewerOf(id);
    const access: CourseAccess = !signedIn(id) ? "signin" : v.status === "removed" && !v.editor ? "removed" : mayOpen(course, v) ? "ok" : "not-enrolled";
    const [o, done] = await Promise.all([store.courseOutline(course.id), store.completedIn(id.userId, course.id)]);
    return render(c, course.title, coursePage(course, o, done, courseProgress(o, done), signedIn(id), canEdit(id), access, v.enrolled.get(course.id) ?? null), { nav: "courses" });
  });

  app.get("/verify/:code", async (c) => {
    const cert = await store.certificate(c.req.param("code"));
    if (!cert)
      return render(c, "Certificate not found", message("No certificate has this code", "Check the link you were given. A withdrawn certificate no longer shows here."), { status: 404 });
    const url = `${env("WHISK_PUBLIC_URL", new URL(c.req.url).origin)}/verify/${cert.code}`;
    return render(c, `Certificate: ${cert.course_title}`, certificatePage(await store.settings(), cert, url, cert.user_id === who(c).userId));
  });

  app.get("/verify/:code/pdf", async (c) => {
    const cert = await store.certificate(c.req.param("code"));
    if (!cert) return notFound(c, "certificate");
    const s = await store.settings();
    const url = `${env("WHISK_PUBLIC_URL", new URL(c.req.url).origin)}/verify/${cert.code}`;
    const pdf = await certificatePdf({ portal: s.portal_name, accent: s.accent, name: cert.learner_name, course: cert.course_title, issued: cert.issued_at, url });
    const file = `certificate-${slugify(cert.course_title, "course")}.pdf`;
    return c.body(new Uint8Array(pdf), 200, {
      "content-type": "application/pdf",
      "content-disposition": `${c.req.query("download") ? "attachment" : "inline"}; filename="${file}"`,
      "cache-control": "private, max-age=300",
    });
  });

  // ----- Signed in -----

  const needSignIn = (title: string, body: string) => async (c: Context, next: () => Promise<void>) => {
    if (!signedIn(who(c))) return render(c, "Sign in", message(title, body, { href: `/.whisk/login?return=${encodeURIComponent(c.req.path)}`, label: "Sign in" }), { status: 403 });
    await next();
  };
  app.use("/learn/*", needSignIn("Sign in to take courses", "Lessons are for signed-in learners."));
  app.use("/me", needSignIn("Sign in to see your learning", "Your progress is kept against your sign-in."));
  app.use("/files/*", needSignIn("Sign in to open this file", "Coursework files are private."));

  // loadLesson finds the course and lesson in the URL and checks the person may take it.
  // It answers a Response when they may not.
  const loadLesson = async (c: Context) => {
    const id = who(c);
    const course = await store.courseBySlug(c.req.param("course")!, canEdit(id));
    if (!course) return notFound(c, "lesson");
    const o = await store.courseOutline(course.id);
    const lesson = flatLessons(o).find((l) => l.slug === c.req.param("lesson"));
    if (!lesson) return notFound(c, "lesson");
    const v = await viewerOf(id);
    if (v.status === "removed" && !v.editor) return removedPage(c);
    if (!mayOpen(course, v))
      return render(c, course.title, message("This course is by invitation", "Ask the business that runs this portal to enroll you.", { href: "/", label: "See your courses" }), { status: 403 });
    await store.seen(id);
    return { id, course, o, lesson };
  };

  // afterProgress is where a learner goes once a lesson is done: the finish page the first
  // time the course is complete, else where they were heading.
  const afterProgress = async (id: Identity, course: Course, next: string) => ((await finished(id.userId!, course, learnerName(id))) ? `/learn/${course.slug}/complete` : next);

  app.get("/learn/:course/complete", async (c) => {
    const id = who(c);
    const course = await store.courseBySlug(c.req.param("course"), canEdit(id));
    if (!course) return notFound(c, "course");
    const [o, done] = await Promise.all([store.courseOutline(course.id), store.completedIn(id.userId, course.id)]);
    if (!courseProgress(o, done).complete) return c.redirect(`/courses/${course.slug}`);
    await finished(id.userId!, course, learnerName(id));
    const cert = await store.issueCertificate(id.userId!, learnerName(id), course);
    return render(c, `Finished ${course.title}`, completePage(course, cert), { nav: "me" });
  });

  app.get("/learn/:course/:lesson", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return found;
    const { id, course, o, lesson } = found;
    const done = await store.completedIn(id.userId, course.id);
    const { prev, next } = neighbors(o, lesson.id);
    let quiz: Html | undefined;
    let coursework: Html | undefined;
    if (lesson.kind === "quiz") {
      const qs = await store.questions(lesson.id);
      const last = c.req.query("retry") ? undefined : await store.lastAttempt(id.userId, lesson.id);
      quiz =
        last && qs.length
          ? quizResult(`${lessonHref(course.slug, lesson)}?retry=1#quiz`, qs, attemptGraded(last, qs), lesson.pass_mark, last.created_at)
          : quizForm(`/learn/${course.slug}/${lesson.slug}/quiz`, qs, lesson.pass_mark);
    }
    if (lesson.kind === "assignment") {
      const subs = await store.submissionsFor(id.userId!, lesson.id);
      const errors: Record<string, string> = { files: "Add at least one file, up to 10, each under 200 MB.", wait: "Your last work is still waiting to be marked." };
      coursework = courseworkPanel({
        uploadUrl: `/learn/${course.slug}/${lesson.slug}/upload`,
        submitUrl: `/learn/${course.slug}/${lesson.slug}/submit`,
        subs,
        canSubmit: courseworkState(subs).canSubmit,
        editor: canEdit(id),
        error: errors[c.req.query("err") ?? ""],
      });
    }
    const body = lessonPage({ course, outline: o, lesson, done, progress: courseProgress(o, done), prev, next, editor: canEdit(id), quiz, coursework, flash: flash(c) });
    return render(c, lesson.title, body, { nav: "courses" });
  });

  app.post("/learn/:course/:lesson/complete", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return found;
    const { id, course, o, lesson } = found;
    if (lesson.kind === "quiz" || lesson.kind === "assignment") return c.redirect(lessonHref(course.slug, lesson));
    await store.complete(id.userId!, lesson.id);
    await lessonDone(id.userId!, course, lesson);
    const next = neighbors(o, lesson.id).next;
    return c.redirect(await afterProgress(id, course, next ? lessonHref(course.slug, next) : `/courses/${course.slug}`));
  });

  app.post("/learn/:course/:lesson/undo", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return found;
    if (found.lesson.kind !== "assignment") await store.uncomplete(found.id.userId!, found.lesson.id);
    return c.redirect(lessonHref(found.course.slug, found.lesson));
  });

  app.post("/learn/:course/:lesson/quiz", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return found;
    const { id, course, lesson } = found;
    if (lesson.kind !== "quiz") return notFound(c, "quiz");
    const qs = await store.questions(lesson.id);
    const form = await c.req.parseBody();
    const answers: Record<number, number | undefined> = Object.fromEntries(
      qs.map((q) => {
        const v = Number(form[`q${q.id}`]);
        return [q.id, Number.isInteger(v) && v >= 0 && v < q.choices.length ? v : undefined];
      }),
    );
    const g = grade(qs, answers, lesson.pass_mark);
    await store.recordAttempt(id.userId!, lesson.id, { ...g, answers });
    const l = await store.learner(id.userId!);
    if (l) await emit(g.passed ? "quiz.passed" : "quiz.failed", { learner: learnerRef(l), course: courseRef(course), lesson: lessonRef(lesson), score: g.score, total: g.total, pass_mark: lesson.pass_mark });
    const here = `${lessonHref(course.slug, lesson)}#quiz`;
    if (!g.passed) return c.redirect(here);
    await store.complete(id.userId!, lesson.id);
    await lessonDone(id.userId!, course, lesson);
    return c.redirect(await afterProgress(id, course, here));
  });

  // Coursework: the browser asks for an upload address per file, sends the file straight to
  // storage, then hands in the list of uploads with a note.
  app.post("/learn/:course/:lesson/upload", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return c.json({ error: "You cannot hand in work for this lesson." }, 403);
    const { id, lesson } = found;
    if (lesson.kind !== "assignment") return c.json({ error: "This lesson takes no files." }, 400);
    if (!courseworkState(await store.submissionsFor(id.userId!, lesson.id)).canSubmit) return c.json({ error: "Your last work is still waiting to be marked." }, 409);
    const b = (await c.req.json().catch(() => ({}))) as { filename?: string; content_type?: string; size?: number };
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0 || size > maxFileBytes) return c.json({ error: "Each file must be smaller than 200 MB." }, 400);
    const filename = text(b.filename, 200).replace(/[\\/\0]/g, "_") || "file";
    const type = /^[\w.+-]+\/[\w.+-]+$/.test(text(b.content_type, 100)) ? text(b.content_type, 100) : "application/octet-stream";
    try {
      const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", { filename, content_type: type, max_bytes: Math.ceil(size), visibility: "private" });
      await store.grantUpload({ upload_id: up.id, user_id: id.userId!, filename, content_type: type, bytes: Math.ceil(size) });
      return c.json({ id: up.id, url: up.url, fields: up.fields });
    } catch (err) {
      log.warn({ request_id: id.requestId, err: String(err) }, "coursework upload not authorized");
      return c.json({ error: "The upload could not start. Try again in a minute." }, 502);
    }
  });

  app.post("/learn/:course/:lesson/submit", async (c) => {
    const found = await loadLesson(c);
    if (found instanceof Response) return found;
    const { id, course, lesson } = found;
    const here = lessonHref(course.slug, lesson);
    if (lesson.kind !== "assignment") return c.redirect(here);
    if (!courseworkState(await store.submissionsFor(id.userId!, lesson.id)).canSubmit) return c.redirect(`${here}?err=wait#coursework`);
    const f = await c.req.parseBody();
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(typeof f.files === "string" ? f.files : "[]");
      ids = Array.isArray(parsed) ? [...new Set(parsed.filter((x): x is string => typeof x === "string").slice(0, 20))] : [];
    } catch {
      ids = [];
    }
    const files = await store.grantedFiles(id.userId!, ids);
    if (files.length !== ids.length || fileProblems(files).length) return c.redirect(`${here}?err=files#coursework`);
    await handIn(id.userId!, course, lesson, text(f.note, 5000), files);
    return c.redirect(`${here}?ok=handed#coursework`);
  });

  // A coursework file opens for its learner and for staff, through a short-lived storage link.
  app.get("/files/:id", async (c) => {
    const id = who(c);
    const owner = await store.fileOwner(c.req.param("id"));
    if (!owner || (owner.user_id !== id.userId && !canEdit(id))) return notFound(c, "file");
    try {
      const up = await whiskApi<{ url?: string; status?: string }>(`/uploads/${encodeURIComponent(c.req.param("id"))}`);
      if (!up.url) throw new Error("no link");
      return c.redirect(up.url);
    } catch (err) {
      const code = (err as { api?: { code?: string } }).api?.code;
      if (code === "OBJECT_QUARANTINED") return render(c, "File blocked", message("This file was blocked", "The virus check flagged it, so it cannot be opened. Ask for it to be handed in again."), { status: 403 });
      log.warn({ request_id: id.requestId, err: String(err) }, "file link failed");
      return render(c, "File not ready", message("This file is not ready yet", "It may still be uploading or being checked. Try again in a minute."), { status: 502 });
    }
  });

  app.get("/me", async (c) => {
    const id = who(c);
    await store.seen(id);
    const v = await viewerOf(id);
    if (v.status === "removed" && !v.editor) return removedPage(c);
    const [rows, certs, done] = await Promise.all([store.learnerCourses(id.userId!), store.certificatesFor(id.userId!), store.completedAll(id.userId)]);
    const mine: MyCourse[] = await Promise.all(
      rows.filter((r) => r.published || v.editor).map(async (r) => {
        const next = courseProgress(await store.courseOutline(r.course_id), done).next;
        return { ...r, next: next && !r.certificate ? lessonHref(r.slug, next) : undefined };
      }),
    );
    return render(c, "My learning", mePage(learnerName(id), mine, certs), { nav: "me" });
  });
};
