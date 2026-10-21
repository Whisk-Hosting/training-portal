// The portal's API, for other systems: a CRM adding the customers it signs, an LMS report,
// a spreadsheet pulling certificates. Keys are made in Settings; a read key can only look.
import { Hono, type Context } from "hono";
import { courseRef } from "./events.js";
import { courseMinutes, flatLessons, isDay, isEmail, keyFrom, type Course } from "./model.js";
import { enrolPerson, invitePeople, setStatus, unenrolPerson } from "./people.js";
import * as store from "./store.js";
import { currentMode } from "./whisk.js";

type Env = { Variables: { key: store.ApiKey } };
export const api = new Hono<Env>();

const fail = (c: Context, status: 400 | 401 | 403 | 404 | 502, code: string, message: string, fix: string) => c.json({ error: { code, message, fix } }, status);

api.use("*", async (c, next) => {
  const raw = keyFrom((n) => c.req.header(n), c.req.query("token"));
  const key = raw ? await store.keyFor(raw) : undefined;
  if (!key) return fail(c, 401, "API_KEY_INVALID", "No valid API key was sent.", "Send Authorization: Bearer <key> (or X-Api-Key, Basic auth with the key as the user name, or ?token=). An admin makes keys in Edit > Settings > API and webhooks.");
  if (c.req.method !== "GET" && key.scope !== "write")
    return fail(c, 403, "API_KEY_READ_ONLY", "This key can only read.", "Make a key with write access in Edit > Settings > API and webhooks.");
  c.set("key", key);
  await next();
});

const actor = (c: Context<Env>) => `API key "${c.get("key").label}"`;

const learnerJson = (l: store.LearnerRow) => ({
  id: l.user_id,
  email: l.email,
  name: l.name,
  status: l.status,
  group: l.group_name,
  invited_at: l.invited_at,
  last_seen: l.status === "invited" ? null : l.last_seen,
});

// courseFrom finds a course by its id or its web address.
const courseFrom = async (v: unknown): Promise<Course | undefined> => {
  if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) return store.courseById(Number(v));
  return typeof v === "string" ? store.courseBySlug(v, true) : undefined;
};

const body = async (c: Context) => (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;

api.get("/", (c) =>
  c.json({
    endpoints: [
      "GET /api/v1/courses",
      "GET /api/v1/learners?email=&group=&status=",
      "POST /api/v1/learners {email, name?, group?, courses?: [id or slug], due_on?: YYYY-MM-DD, send_email?: true}",
      "GET /api/v1/learners/:id",
      "PATCH /api/v1/learners/:id {status?: active | removed, group?: name | null}",
      "POST /api/v1/learners/:id/courses {course: id or slug, due_on?, send_email?: true}",
      "DELETE /api/v1/learners/:id/courses/:course",
      "GET /api/v1/groups",
      "GET /api/v1/certificates?since=ISO-date",
      "GET /api/v1/progress",
    ],
  }),
);

api.get("/courses", async (c) => {
  const list = await store.courses(true);
  return c.json({
    courses: await Promise.all(
      list.map(async (co) => {
        const o = await store.courseOutline(co.id);
        return { ...courseRef(co), summary: co.summary, published: co.published, access: co.access, lessons: flatLessons(o).length, minutes: courseMinutes(o) };
      }),
    ),
  });
});

api.get("/learners", async (c) => {
  const email = c.req.query("email");
  if (email) {
    const l = await store.learnerByEmail(email);
    return c.json({ learners: l ? [learnerJson(l)] : [] });
  }
  const groupName = c.req.query("group");
  const group = groupName ? (await store.groups()).find((g) => g.name === groupName) : undefined;
  if (groupName && !group) return c.json({ learners: [] });
  const status = c.req.query("status");
  return c.json({ learners: (await store.learners({ group: group?.id, status: status || undefined })).map(learnerJson) });
});

api.post("/learners", async (c) => {
  // Where inviting is off (the live demo), say so instead of trying.
  const off = currentMode().refuse("POST", "/customers");
  if (off) return c.json({ error: off }, 403);
  const b = await body(c);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!isEmail(email)) return fail(c, 400, "EMAIL_INVALID", "email is missing or not an email address.", 'Send {"email": "person@example.com"}.');
  const due = typeof b?.due_on === "string" && b.due_on ? b.due_on : null;
  if (due && !isDay(due)) return fail(c, 400, "DUE_INVALID", "due_on is not a date.", "Send due_on as YYYY-MM-DD.");
  const wanted = Array.isArray(b?.courses) ? b.courses : [];
  const courses = await Promise.all(wanted.map(courseFrom));
  const missing = wanted.filter((_, i) => !courses[i]);
  if (missing.length) return fail(c, 404, "COURSE_NOT_FOUND", `No course matches ${missing.join(", ")}.`, "GET /api/v1/courses lists each course's id and slug.");
  const [r] = await invitePeople(
    [{ email, name: typeof b?.name === "string" ? b.name.trim().slice(0, 120) : "", group: typeof b?.group === "string" ? b.group.trim().slice(0, 80) : "" }],
    { courses: courses as Course[], due, groupId: null, sendEmail: b?.send_email !== false, actor: actor(c) },
  );
  if (r.outcome === "failed") return fail(c, 502, "INVITE_FAILED", r.error ?? "Whisk could not add them.", "Try again in a minute.");
  const l = (await store.learner(r.user_id!))!;
  return c.json({ learner: learnerJson(l), invite_url: r.link, emailed: r.emailed, created: r.outcome === "added" }, r.outcome === "added" ? 201 : 200);
});

api.get("/learners/:id", async (c) => {
  const l = await store.learner(c.req.param("id"));
  if (!l) return fail(c, 404, "LEARNER_NOT_FOUND", "No learner has that id.", "GET /api/v1/learners?email= finds a learner's id.");
  const courses = await store.learnerCourses(l.user_id);
  return c.json({
    learner: learnerJson(l),
    courses: courses.map((x) => ({
      id: x.course_id,
      slug: x.slug,
      title: x.title,
      enrolled: x.enrolled,
      due_on: x.due_on ? new Date(x.due_on).toISOString().slice(0, 10) : null,
      lessons_done: x.done,
      lessons_required: x.required,
      completed: !!x.certificate,
      certificate: x.certificate,
    })),
  });
});

api.patch("/learners/:id", async (c) => {
  const l = await store.learner(c.req.param("id"));
  if (!l) return fail(c, 404, "LEARNER_NOT_FOUND", "No learner has that id.", "GET /api/v1/learners?email= finds a learner's id.");
  const b = (await body(c)) ?? {};
  if (b.status !== undefined && b.status !== "active" && b.status !== "removed")
    return fail(c, 400, "STATUS_INVALID", "status must be active or removed.", 'Send {"status": "removed"} to take away access.');
  if (b.group !== undefined && b.group !== null && typeof b.group !== "string") return fail(c, 400, "GROUP_INVALID", "group must be a name or null.", 'Send {"group": "Retail"}.');
  if (b.status && b.status !== l.status) await setStatus(l.user_id, b.status as "active" | "removed", actor(c));
  if (b.group !== undefined) {
    const groupId = typeof b.group === "string" && b.group.trim() ? await store.groupByName(b.group.trim().slice(0, 80)) : null;
    await store.setLearnerGroup(l.user_id, groupId);
    await store.audit(actor(c), "Changed group", l.user_id, { group: typeof b.group === "string" ? b.group : "none" });
  }
  return c.json({ learner: learnerJson((await store.learner(l.user_id))!) });
});

api.post("/learners/:id/courses", async (c) => {
  const l = await store.learner(c.req.param("id"));
  if (!l) return fail(c, 404, "LEARNER_NOT_FOUND", "No learner has that id.", "GET /api/v1/learners?email= finds a learner's id.");
  const b = (await body(c)) ?? {};
  const course = await courseFrom(b.course);
  if (!course) return fail(c, 404, "COURSE_NOT_FOUND", "No course matches that id or slug.", "GET /api/v1/courses lists each course's id and slug.");
  const due = typeof b.due_on === "string" && b.due_on ? b.due_on : null;
  if (due && !isDay(due)) return fail(c, 400, "DUE_INVALID", "due_on is not a date.", "Send due_on as YYYY-MM-DD.");
  await enrolPerson(l.user_id, course, due, actor(c), b.send_email !== false);
  return c.json({ enrolled: { learner: l.user_id, course: courseRef(course), due_on: due } }, 201);
});

api.delete("/learners/:id/courses/:course", async (c) => {
  const l = await store.learner(c.req.param("id"));
  const course = await courseFrom(c.req.param("course"));
  if (!l || !course) return fail(c, 404, "NOT_FOUND", "No such learner or course.", "Check the learner id and the course id or slug.");
  await unenrolPerson(l.user_id, course, actor(c));
  return c.body(null, 204);
});

api.get("/groups", async (c) =>
  c.json({
    groups: (await store.groups()).map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members,
      courses: g.courses.map((x) => ({ id: x.course_id, title: x.title, due_on: x.due_on })),
    })),
  }),
);

api.get("/certificates", async (c) => {
  const since = c.req.query("since");
  const d = since ? new Date(since) : undefined;
  if (d && Number.isNaN(d.getTime())) return fail(c, 400, "SINCE_INVALID", "since is not a date.", "Send since as an ISO date, like 2026-01-31.");
  const base = new URL(c.req.url).origin;
  return c.json({
    certificates: (await store.allCertificates(d)).map((x) => ({
      code: x.code,
      url: `${process.env.WHISK_PUBLIC_URL ?? base}/verify/${x.code}`,
      learner: { id: x.user_id, email: x.email, name: x.learner_name },
      course: { id: x.course_id, slug: x.course_slug ?? null, title: x.course_title },
      issued_at: x.issued_at,
    })),
  });
});

api.get("/progress", async (c) =>
  c.json({
    progress: (await store.progressExport()).map((r) => ({
      email: r.email,
      name: r.name,
      group: r.group_name,
      status: r.status,
      course: r.course,
      enrolled: r.enrolled,
      due_on: r.due_on,
      lessons_done: r.done,
      lessons_required: r.required,
      completed_at: r.completed_at,
      certificate: r.certificate,
      last_seen: r.last_seen,
    })),
  }),
);

api.notFound((c) => fail(c, 404, "NOT_FOUND", "There is no such API endpoint.", "GET /api/v1 lists the endpoints."));
