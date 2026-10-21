// The course editor: courses, modules, lessons, videos and quiz questions.
import type { Context, Hono } from "hono";
import { sql } from "../db.js";
import { markdown } from "../markdown.js";
import { moved, questionProblems, slugify, uniqueSlug, type Choice, type Kind } from "../model.js";
import * as store from "../store.js";
import { editCourse, editHome, editLesson, type CourseRow } from "../views/editor.js";
import { flash, idParam, intIn, navFor, notFound, render, text, who } from "../web.js";
import { log, whiskApi } from "../whisk.js";

export const courseRoutes = (app: Hono) => {
  const direction = async (c: Context) => ((await c.req.parseBody()).dir === "up" ? "up" : "down");

  app.get("/edit", async (c) => {
    const rows = await sql<CourseRow[]>`
      select co.id, co.slug, co.title, co.summary, co.published, co.position, co.access,
        (select count(*)::int from lessons l join modules m on m.id = l.module_id where m.course_id = co.id) as lessons,
        (select count(distinct p.user_id)::int from progress p join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id where m.course_id = co.id) as learners
      from courses co order by co.position, co.id`;
    return render(c, "Courses", editHome(rows, await navFor(c), flash(c)), { nav: "edit" });
  });

  app.post("/edit/courses", async (c) => {
    const f = await c.req.parseBody();
    const title = text(f.title, 120);
    if (!title) return c.redirect("/edit");
    const taken = new Set((await sql<{ slug: string }[]>`select slug from courses`).map((r) => r.slug));
    const [{ id }] = await sql<{ id: number }[]>`insert into courses (slug, title, summary, position)
      values (${uniqueSlug(slugify(title, "course"), taken)}, ${title}, ${text(f.summary, 400)}, (select coalesce(max(position), 0) + 1 from courses)) returning id`;
    await sql`insert into modules (course_id, title, position) values (${id}, 'Getting started', 0)`;
    return c.redirect(`/edit/courses/${id}?ok=created`);
  });

  app.post("/edit/courses/:id/move", async (c) => {
    const ids = (await sql<{ id: number }[]>`select id from courses order by position, id`).map((r) => r.id);
    await store.reorder("courses", moved(ids, idParam(c), await direction(c)));
    return c.redirect("/edit");
  });

  app.get("/edit/courses/:id", async (c) => {
    const course = await store.courseById(idParam(c));
    if (!course) return notFound(c, "course");
    const error = c.req.query("err") === "slug" ? "That web address is taken by another course." : undefined;
    return render(c, `Edit ${course.title}`, editCourse(course, await store.courseOutline(course.id), flash(c), error), { nav: "edit" });
  });

  app.post("/edit/courses/:id", async (c) => {
    const course = await store.courseById(idParam(c));
    if (!course) return notFound(c, "course");
    const f = await c.req.parseBody();
    const slug = slugify(text(f.slug, 60), course.slug);
    if ((await sql`select 1 from courses where slug = ${slug} and id <> ${course.id}`).length) return c.redirect(`/edit/courses/${course.id}?err=slug`);
    await sql`update courses set title = ${text(f.title, 120) || course.title}, slug = ${slug}, summary = ${text(f.summary, 400)},
      published = ${f.published === "1"}, access = ${f.access === "enrolled" ? "enrolled" : "open"}, updated_at = now() where id = ${course.id}`;
    return c.redirect(`/edit/courses/${course.id}?ok=saved`);
  });

  app.post("/edit/courses/:id/delete", async (c) => {
    await sql`delete from courses where id = ${idParam(c)}`;
    return c.redirect("/edit?ok=deleted");
  });

  app.post("/edit/courses/:id/modules", async (c) => {
    const course = await store.courseById(idParam(c));
    if (!course) return notFound(c, "course");
    const title = text((await c.req.parseBody()).title, 120);
    if (!title) return c.redirect(`/edit/courses/${course.id}`);
    const [{ id }] = await sql<{ id: number }[]>`insert into modules (course_id, title, position)
      values (${course.id}, ${title}, (select coalesce(max(position), 0) + 1 from modules where course_id = ${course.id})) returning id`;
    return c.redirect(`/edit/courses/${course.id}?ok=added#module-${id}`);
  });

  app.post("/edit/modules/:id", async (c) => {
    const m = await store.moduleById(idParam(c));
    if (!m) return notFound(c, "module");
    const f = await c.req.parseBody();
    await sql`update modules set title = ${text(f.title, 120) || m.title}, summary = ${text(f.summary, 600)} where id = ${m.id}`;
    return c.redirect(`/edit/courses/${m.course_id}?ok=saved#module-${m.id}`);
  });

  app.post("/edit/modules/:id/move", async (c) => {
    const m = await store.moduleById(idParam(c));
    if (!m) return notFound(c, "module");
    const ids = (await sql<{ id: number }[]>`select id from modules where course_id = ${m.course_id} order by position, id`).map((r) => r.id);
    await store.reorder("modules", moved(ids, m.id, await direction(c)));
    return c.redirect(`/edit/courses/${m.course_id}#module-${m.id}`);
  });

  app.post("/edit/modules/:id/delete", async (c) => {
    const m = await store.moduleById(idParam(c));
    if (!m) return notFound(c, "module");
    await sql`delete from modules where id = ${m.id}`;
    return c.redirect(`/edit/courses/${m.course_id}?ok=deleted`);
  });

  const kinds: Kind[] = ["read", "video", "quiz", "assignment"];
  const kindOf = (v: unknown, fallback: Kind): Kind => (kinds.includes(v as Kind) ? (v as Kind) : fallback);
  // "complete" is the finish page's address, so no lesson may take it.
  const takenLessonSlugs = async (courseId: number, except = 0) =>
    new Set([
      "complete",
      ...(await sql<{ slug: string }[]>`select l.slug from lessons l join modules m on m.id = l.module_id where m.course_id = ${courseId} and l.id <> ${except}`).map((r) => r.slug),
    ]);

  app.post("/edit/modules/:id/lessons", async (c) => {
    const m = await store.moduleById(idParam(c));
    if (!m) return notFound(c, "module");
    const f = await c.req.parseBody();
    const title = text(f.title, 120);
    if (!title) return c.redirect(`/edit/courses/${m.course_id}`);
    const kind = kindOf(f.kind, "read");
    const slug = uniqueSlug(slugify(title, "lesson"), await takenLessonSlugs(m.course_id));
    const [{ id }] = await sql<{ id: number }[]>`insert into lessons (module_id, title, slug, kind, minutes, position)
      values (${m.id}, ${title}, ${slug}, ${kind}, ${kind === "video" ? 8 : kind === "assignment" ? 30 : 5},
        (select coalesce(max(position), 0) + 1 from lessons where module_id = ${m.id})) returning id`;
    return c.redirect(`/edit/lessons/${id}?ok=created`);
  });

  app.get("/edit/lessons/:id", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return notFound(c, "lesson");
    const [course, m, qs] = await Promise.all([store.courseById(l.course_id), store.moduleById(l.module_id), store.questions(l.id)]);
    const errors: Record<string, string> = {
      slug: "That web address is taken by another lesson in this course.",
      question: "A question needs its text, at least two answers and exactly one marked correct.",
    };
    return render(c, `Edit ${l.title}`, editLesson(course!, m!, l, qs, flash(c), errors[c.req.query("err") ?? ""]), { nav: "edit" });
  });

  app.post("/edit/lessons/:id", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return notFound(c, "lesson");
    const f = await c.req.parseBody();
    const slug = slugify(text(f.slug, 60), l.slug);
    if ((await takenLessonSlugs(l.course_id, l.id)).has(slug)) return c.redirect(`/edit/lessons/${l.id}?err=slug`);
    await sql`update lessons set title = ${text(f.title, 120) || l.title}, slug = ${slug}, kind = ${kindOf(f.kind, l.kind)},
      body = ${typeof f.body === "string" ? f.body.slice(0, 100_000) : l.body}, minutes = ${intIn(f.minutes, 0, 600, l.minutes)},
      pass_mark = ${intIn(f.pass_mark, 0, 100, l.pass_mark)}, depth = ${f.depth === "1" ? 1 : 0}, optional = ${f.optional === "1"},
      updated_at = now() where id = ${l.id}`;
    return c.redirect(`/edit/lessons/${l.id}?ok=saved`);
  });

  app.post("/edit/lessons/:id/move", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return notFound(c, "lesson");
    const ids = (await sql<{ id: number }[]>`select id from lessons where module_id = ${l.module_id} order by position, id`).map((r) => r.id);
    await store.reorder("lessons", moved(ids, l.id, await direction(c)));
    return c.redirect(`/edit/courses/${l.course_id}#module-${l.module_id}`);
  });

  app.post("/edit/lessons/:id/delete", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return notFound(c, "lesson");
    await sql`delete from lessons where id = ${l.id}`;
    return c.redirect(`/edit/courses/${l.course_id}?ok=deleted#module-${l.module_id}`);
  });

  // The browser uploads the video straight to storage; this only asks Whisk for the address.
  app.post("/edit/lessons/:id/upload", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return c.json({ error: "That lesson no longer exists." }, 404);
    const b = (await c.req.json().catch(() => ({}))) as { filename?: string; content_type?: string; size?: number };
    const type = text(b.content_type, 100);
    if (!/^(video|audio)\//.test(type)) return c.json({ error: "Choose a video or audio file." }, 400);
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 ** 3) return c.json({ error: "The file must be smaller than 5 GB." }, 400);
    try {
      const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", {
        filename: text(b.filename, 200) || "video",
        content_type: type,
        max_bytes: Math.ceil(size),
        visibility: "private",
      });
      return c.json({ id: up.id, url: up.url, fields: up.fields });
    } catch (err) {
      log.warn({ request_id: who(c).requestId, err: String(err) }, "upload not authorized");
      return c.json({ error: "Whisk could not start the upload. Try again in a minute." }, 502);
    }
  });

  app.post("/edit/lessons/:id/video", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return c.json({ error: "That lesson no longer exists." }, 404);
    const b = (await c.req.json().catch(() => ({}))) as { upload_id?: string };
    const uploadId = text(b.upload_id, 80);
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(uploadId)) return c.json({ error: "That upload id is not valid." }, 400);
    await sql`update lessons set video_upload_id = ${uploadId}, updated_at = now() where id = ${l.id}`;
    return c.json({ ok: true });
  });

  // readQuestion turns the question form into choices; empty answer boxes are dropped.
  const readQuestion = async (c: Context) => {
    const f = await c.req.parseBody({ all: true });
    const boxes = Array.isArray(f.choice) ? f.choice : [f.choice];
    const correct = Number(f.correct);
    const choices: Choice[] = boxes.map((t, i) => ({ text: text(t, 300), correct: i === correct })).filter((ch) => ch.text);
    return { prompt: text(f.prompt, 1000), choices, explanation: text(f.explanation, 1500) };
  };

  app.post("/edit/lessons/:id/questions", async (c) => {
    const l = await store.lessonById(idParam(c));
    if (!l) return notFound(c, "lesson");
    const q = await readQuestion(c);
    if (questionProblems(q.prompt, q.choices).length) return c.redirect(`/edit/lessons/${l.id}?err=question`);
    await sql`insert into questions (lesson_id, prompt, choices, explanation, position)
      values (${l.id}, ${q.prompt}, ${sql.json(q.choices)}, ${q.explanation}, (select coalesce(max(position), 0) + 1 from questions where lesson_id = ${l.id}))`;
    return c.redirect(`/edit/lessons/${l.id}?ok=added`);
  });

  const questionLesson = async (id: number) => (await sql<{ lesson_id: number }[]>`select lesson_id from questions where id = ${id}`)[0]?.lesson_id;

  app.post("/edit/questions/:id", async (c) => {
    const lessonId = await questionLesson(idParam(c));
    if (!lessonId) return notFound(c, "question");
    const q = await readQuestion(c);
    if (questionProblems(q.prompt, q.choices).length) return c.redirect(`/edit/lessons/${lessonId}?err=question`);
    await sql`update questions set prompt = ${q.prompt}, choices = ${sql.json(q.choices)}, explanation = ${q.explanation} where id = ${idParam(c)}`;
    return c.redirect(`/edit/lessons/${lessonId}?ok=saved`);
  });

  app.post("/edit/questions/:id/move", async (c) => {
    const lessonId = await questionLesson(idParam(c));
    if (!lessonId) return notFound(c, "question");
    const ids = (await sql<{ id: number }[]>`select id from questions where lesson_id = ${lessonId} order by position, id`).map((r) => r.id);
    await store.reorder("questions", moved(ids, idParam(c), await direction(c)));
    return c.redirect(`/edit/lessons/${lessonId}`);
  });

  app.post("/edit/questions/:id/delete", async (c) => {
    const lessonId = await questionLesson(idParam(c));
    if (!lessonId) return notFound(c, "question");
    await sql`delete from questions where id = ${idParam(c)}`;
    return c.redirect(`/edit/lessons/${lessonId}?ok=deleted`);
  });

  app.post("/edit/preview", async (c) => c.html(markdown((await c.req.text()).slice(0, 100_000))));
};
