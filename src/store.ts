// Reading and writing the portal's rows. Each function is one small query; decisions live in
// model.ts.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db.js";
import { earliest, outline, type Course, type MailMode, type Lesson, type Module, type ModuleOutline, type Question, type Viewer } from "./model.js";
import type { Identity } from "./whisk.js";

export type Settings = {
  portal_name: string;
  tagline: string;
  accent: string;
  email_from: string;
  notify_email: string;
  reminders: boolean;
  mail_mode: MailMode;
};

const defaults: Settings = {
  portal_name: "Training",
  tagline: "",
  accent: "#e85d2a",
  email_from: "",
  notify_email: "",
  reminders: true,
  mail_mode: "whisk",
};

export const settings = async (): Promise<Settings> => {
  const [s] = await sql<Settings[]>`select portal_name, tagline, accent, email_from, notify_email, reminders, mail_mode from settings where id = 1`;
  return s ?? defaults;
};

export const saveLook = (s: Pick<Settings, "portal_name" | "tagline" | "accent">) =>
  sql`update settings set portal_name = ${s.portal_name}, tagline = ${s.tagline}, accent = ${s.accent}, updated_at = now() where id = 1`;

export const saveMail = (s: Pick<Settings, "email_from" | "notify_email" | "reminders" | "mail_mode">) =>
  sql`update settings set email_from = ${s.email_from}, notify_email = ${s.notify_email}, reminders = ${s.reminders}, mail_mode = ${s.mail_mode},
    updated_at = now() where id = 1`;

export const courses = (includeDrafts: boolean) =>
  sql<Course[]>`select id, slug, title, summary, published, position, access from courses
    where ${includeDrafts} or published order by position, id`;

export const courseBySlug = async (slug: string, includeDrafts: boolean): Promise<Course | undefined> =>
  (await sql<Course[]>`select id, slug, title, summary, published, position, access from courses
    where slug = ${slug} and (${includeDrafts} or published)`)[0];

export const courseById = async (id: number): Promise<Course | undefined> =>
  (await sql<Course[]>`select id, slug, title, summary, published, position, access from courses where id = ${id}`)[0];

const lessonCols = sql`l.id, l.module_id, l.position, l.slug, l.title, l.kind, l.depth, l.optional, l.minutes, l.body, l.video_upload_id, l.pass_mark`;

export const courseOutline = async (courseId: number): Promise<ModuleOutline[]> => {
  const [mods, lessons] = await Promise.all([
    sql<Module[]>`select id, course_id, position, title, summary from modules where course_id = ${courseId}`,
    sql<Lesson[]>`select ${lessonCols} from lessons l join modules m on m.id = l.module_id where m.course_id = ${courseId}`,
  ]);
  return outline(mods, lessons);
};

export const lessonById = async (id: number): Promise<(Lesson & { course_id: number }) | undefined> =>
  (await sql<(Lesson & { course_id: number })[]>`select ${lessonCols}, m.course_id from lessons l
    join modules m on m.id = l.module_id where l.id = ${id}`)[0];

export const moduleById = async (id: number): Promise<Module | undefined> =>
  (await sql<Module[]>`select id, course_id, position, title, summary from modules where id = ${id}`)[0];

export const questions = (lessonId: number) =>
  sql<Question[]>`select id, lesson_id, position, prompt, choices, explanation from questions
    where lesson_id = ${lessonId} order by position, id`;

// seen records the person on every lesson visit, so editors see who is learning. An invited
// customer becomes active on their first visit; a removed one stays removed.
export const seen = (id: Identity) =>
  id.userId
    ? sql`insert into learners (user_id, email, name, audience, status) values (${id.userId}, ${id.email ?? ""}, ${id.name ?? ""}, ${id.audience}, 'active')
        on conflict (user_id) do update set email = excluded.email, name = coalesce(nullif(excluded.name, ''), learners.name), audience = excluded.audience,
          last_seen = now(), status = case when learners.status = 'removed' then 'removed' else 'active' end`
    : Promise.resolve();

// viewer is what decides access for one person: their status and every course they are
// enrolled in, on their own or through their group, with the earlier due date.
export const viewer = async (id: Identity, editor: boolean): Promise<Viewer> => {
  if (!id.userId) return { editor, status: "new", enrolled: new Map() };
  const [[row], rows] = await Promise.all([
    sql<{ status: Viewer["status"] }[]>`select status from learners where user_id = ${id.userId}`,
    sql<{ course_id: number; due_on: Date | null }[]>`
      select course_id, due_on from enrolments where user_id = ${id.userId}
      union all
      select gc.course_id, gc.due_on from group_courses gc join learners le on le.group_id = gc.group_id where le.user_id = ${id.userId}`,
  ]);
  const enrolled = rows.reduce((m, r) => m.set(r.course_id, earliest(m.get(r.course_id), r.due_on)), new Map<number, Date | null>());
  return { editor, status: row?.status ?? "new", enrolled };
};

export const completedIn = async (userId: string | undefined, courseId: number): Promise<Set<number>> => {
  if (!userId) return new Set();
  const rows = await sql<{ lesson_id: number }[]>`select p.lesson_id from progress p
    join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id
    where p.user_id = ${userId} and m.course_id = ${courseId}`;
  return new Set(rows.map((r) => r.lesson_id));
};

export const completedAll = async (userId: string | undefined): Promise<Set<number>> => {
  if (!userId) return new Set();
  const rows = await sql<{ lesson_id: number }[]>`select lesson_id from progress where user_id = ${userId}`;
  return new Set(rows.map((r) => r.lesson_id));
};

export const complete = (userId: string, lessonId: number) =>
  sql`insert into progress (user_id, lesson_id) values (${userId}, ${lessonId}) on conflict do nothing`;

export const uncomplete = (userId: string, lessonId: number) =>
  sql`delete from progress where user_id = ${userId} and lesson_id = ${lessonId}`;

export type Attempt = { id: number; score: number; total: number; passed: boolean; answers: Record<string, number>; created_at: Date };

export const lastAttempt = async (userId: string | undefined, lessonId: number): Promise<Attempt | undefined> =>
  userId
    ? (await sql<Attempt[]>`select id, score, total, passed, answers, created_at from attempts
        where user_id = ${userId} and lesson_id = ${lessonId} order by created_at desc, id desc limit 1`)[0]
    : undefined;

export const recordAttempt = (userId: string, lessonId: number, a: { score: number; total: number; passed: boolean; answers: Record<number, number | undefined> }) =>
  sql`insert into attempts (user_id, lesson_id, score, total, passed, answers)
    values (${userId}, ${lessonId}, ${a.score}, ${a.total}, ${a.passed}, ${sql.json(a.answers as Record<string, number>)})`;

export type Certificate = { code: string; user_id: string; course_id: number; learner_name: string; course_title: string; issued_at: Date; course_slug?: string };

// issueCertificate gives one certificate per person per course; a second call returns the first
// with fresh false, so only the first finish sends news of it.
export const issueCertificate = async (userId: string, learnerName: string, course: Course): Promise<Certificate & { fresh: boolean }> => {
  const code = randomBytes(9).toString("base64url");
  const made = await sql`insert into certificates (code, user_id, course_id, learner_name, course_title)
    values (${code}, ${userId}, ${course.id}, ${learnerName}, ${course.title}) on conflict (user_id, course_id) do nothing returning code`;
  const [c] = await sql<Certificate[]>`select code, user_id, course_id, learner_name, course_title, issued_at from certificates
    where user_id = ${userId} and course_id = ${course.id}`;
  return { ...c, fresh: made.length > 0 };
};

export type CertificateRow = Certificate & { email: string };
export const allCertificates = (since?: Date) =>
  sql<CertificateRow[]>`select c.code, c.user_id, c.course_id, c.learner_name, c.course_title, c.issued_at, co.slug as course_slug, coalesce(le.email, '') as email
    from certificates c left join courses co on co.id = c.course_id left join learners le on le.user_id = c.user_id
    where (${since ?? null}::timestamptz is null or c.issued_at >= ${since ?? null}) order by c.issued_at desc limit 5000`;

export const certificate = async (code: string): Promise<Certificate | undefined> =>
  (await sql<Certificate[]>`select c.code, c.user_id, c.course_id, c.learner_name, c.course_title, c.issued_at, co.slug as course_slug
    from certificates c left join courses co on co.id = c.course_id where c.code = ${code}`)[0];

export const certificatesFor = (userId: string) =>
  sql<Certificate[]>`select c.code, c.user_id, c.course_id, c.learner_name, c.course_title, c.issued_at, co.slug as course_slug
    from certificates c left join courses co on co.id = c.course_id where c.user_id = ${userId} order by issued_at desc`;

export type LearnerRow = {
  user_id: string;
  email: string;
  name: string;
  audience: string;
  status: "invited" | "active" | "removed";
  group_id: number | null;
  group_name: string | null;
  invite_url: string;
  invited_at: Date | null;
  last_seen: Date;
  done: number;
  certificates: number;
  enrolments: number;
};

const learnerSelect = sql`select le.user_id, le.email, le.name, le.audience, le.status, le.group_id, g.name as group_name, le.invite_url,
    le.invited_at, le.last_seen,
    (select count(*)::int from progress p where p.user_id = le.user_id) as done,
    (select count(*)::int from certificates c where c.user_id = le.user_id) as certificates,
    (select count(*)::int from enrolments e where e.user_id = le.user_id) as enrolments
  from learners le left join groups g on g.id = le.group_id`;

export const learners = (f: { group?: number; status?: string; q?: string } = {}) =>
  sql<LearnerRow[]>`${learnerSelect}
    where (${f.group ?? null}::int is null or le.group_id = ${f.group ?? null})
      and (${f.status ?? null}::text is null or le.status = ${f.status ?? null})
      and (${f.q ?? null}::text is null or le.email ilike ${"%" + (f.q ?? "") + "%"} or le.name ilike ${"%" + (f.q ?? "") + "%"})
    order by le.last_seen desc limit 1000`;

export const learner = async (userId: string): Promise<LearnerRow | undefined> => (await sql<LearnerRow[]>`${learnerSelect} where le.user_id = ${userId}`)[0];
export const learnerByEmail = async (email: string): Promise<LearnerRow | undefined> =>
  (await sql<LearnerRow[]>`${learnerSelect} where le.email = ${email.toLowerCase()} order by le.last_seen desc limit 1`)[0];

export type LearnerCourse = {
  course_id: number;
  title: string;
  slug: string;
  published: boolean;
  done: number;
  required: number;
  certificate: string | null;
  enrolled: boolean;
  via_group: boolean;
  due_on: Date | null;
};

// learnerCourses is, for one person, every course they are enrolled in or have started, with
// lessons done out of the required ones.
export const learnerCourses = (userId: string) =>
  sql<LearnerCourse[]>`
    with mine as (
      select course_id, due_on, false as via_group from enrolments where user_id = ${userId}
      union all
      select gc.course_id, gc.due_on, true from group_courses gc join learners le on le.group_id = gc.group_id where le.user_id = ${userId}
    ), started as (
      select distinct m.course_id from progress p join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id where p.user_id = ${userId}
    )
    select co.id as course_id, co.title, co.slug, co.published,
      (select count(*)::int from progress p join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id
        where p.user_id = ${userId} and m.course_id = co.id and not l.optional) as done,
      (select count(*)::int from lessons l join modules m on m.id = l.module_id where m.course_id = co.id and not l.optional) as required,
      (select code from certificates c where c.user_id = ${userId} and c.course_id = co.id) as certificate,
      exists (select 1 from mine where mine.course_id = co.id) as enrolled,
      coalesce(bool_and(mine.via_group), false) as via_group,
      min(mine.due_on) as due_on
    from courses co left join mine on mine.course_id = co.id
    where co.id in (select course_id from mine) or co.id in (select course_id from started)
    group by co.id order by co.position, co.id`;

// addLearner records an invited customer under the id Whisk gave them, which is the id they
// will sign in with. Inviting someone again keeps their history and lets a removed person back.
export const addLearner = (l: { user_id: string; email: string; name: string; group_id: number | null; invite_url: string }) =>
  sql`insert into learners (user_id, email, name, audience, status, group_id, invite_url, invited_at, last_seen)
    values (${l.user_id}, ${l.email}, ${l.name}, 'customer', 'invited', ${l.group_id}, ${l.invite_url}, now(), now())
    on conflict (user_id) do update set name = coalesce(nullif(excluded.name, ''), learners.name),
      group_id = coalesce(excluded.group_id, learners.group_id), invite_url = excluded.invite_url, invited_at = now(),
      status = case when learners.status = 'active' then 'active' else 'invited' end`;

export const setLearnerStatus = (userId: string, status: "active" | "removed" | "invited") => sql`update learners set status = ${status} where user_id = ${userId}`;
export const setLearnerGroup = (userId: string, groupId: number | null) => sql`update learners set group_id = ${groupId} where user_id = ${userId}`;

export const enrol = (userId: string, courseId: number, dueOn: string | null, by: string) =>
  sql`insert into enrolments (user_id, course_id, due_on, enrolled_by) values (${userId}, ${courseId}, ${dueOn}, ${by})
    on conflict (user_id, course_id) do update set due_on = excluded.due_on`;
export const unenrol = (userId: string, courseId: number) => sql`delete from enrolments where user_id = ${userId} and course_id = ${courseId}`;

export type Group = { id: number; name: string; members: number; courses: { course_id: number; title: string; due_on: Date | null }[] };
export const groups = () =>
  sql<Group[]>`select g.id, g.name,
      (select count(*)::int from learners le where le.group_id = g.id and le.status <> 'removed') as members,
      coalesce((select json_agg(json_build_object('course_id', co.id, 'title', co.title, 'due_on', gc.due_on) order by co.position)
        from group_courses gc join courses co on co.id = gc.course_id where gc.group_id = g.id), '[]') as courses
    from groups g order by g.name`;
export const groupByName = async (name: string): Promise<number> => {
  const [g] = await sql<{ id: number }[]>`insert into groups (name) values (${name}) on conflict (name) do update set name = excluded.name returning id`;
  return g.id;
};
export const enrolGroup = (groupId: number, courseId: number, dueOn: string | null) =>
  sql`insert into group_courses (group_id, course_id, due_on) values (${groupId}, ${courseId}, ${dueOn}) on conflict (group_id, course_id) do update set due_on = excluded.due_on`;
export const unenrolGroup = (groupId: number, courseId: number) => sql`delete from group_courses where group_id = ${groupId} and course_id = ${courseId}`;

// resetProgress clears one person's lessons, quiz tries and coursework in a course; their
// certificate goes too, so finishing again issues a new one.
export const resetProgress = (userId: string, courseId: number) =>
  sql.begin(async (tx) => {
    const lessonIds = tx`select l.id from lessons l join modules m on m.id = l.module_id where m.course_id = ${courseId}`;
    await tx`delete from progress where user_id = ${userId} and lesson_id in (${lessonIds})`;
    await tx`delete from attempts where user_id = ${userId} and lesson_id in (${lessonIds})`;
    await tx`delete from submissions where user_id = ${userId} and lesson_id in (${lessonIds})`;
    await tx`delete from certificates where user_id = ${userId} and course_id = ${courseId}`;
  });

// completeCourse marks every required lesson done for one person, for training given in person.
export const completeCourse = (userId: string, courseId: number) =>
  sql`insert into progress (user_id, lesson_id) select ${userId}, l.id from lessons l join modules m on m.id = l.module_id
    where m.course_id = ${courseId} and not l.optional on conflict do nothing`;

export const revokeCertificate = (code: string) => sql`delete from certificates where code = ${code}`;

// ----- Coursework -----

export type FileRef = { id: string; name: string; size: number; type: string };
export type Submission = {
  id: number;
  user_id: string;
  lesson_id: number;
  note: string;
  files: FileRef[];
  status: "submitted" | "passed" | "redo";
  feedback: string;
  marked_by: string;
  marked_at: Date | null;
  created_at: Date;
};
const submissionCols = sql`s.id, s.user_id, s.lesson_id, s.note, s.files, s.status, s.feedback, s.marked_by, s.marked_at, s.created_at`;

export const submissionsFor = (userId: string, lessonId: number) =>
  sql<Submission[]>`select ${submissionCols} from submissions s where s.user_id = ${userId} and s.lesson_id = ${lessonId} order by s.created_at desc, s.id desc`;

export const submit = async (userId: string, lessonId: number, note: string, files: FileRef[]) =>
  (await sql<{ id: number }[]>`insert into submissions (user_id, lesson_id, note, files) values (${userId}, ${lessonId}, ${note}, ${sql.json(files)}) returning id`)[0].id;

export type QueueItem = Submission & { learner_name: string; learner_email: string; lesson_title: string; lesson_slug: string; course_title: string; course_slug: string };
export const markingQueue = (status: "submitted" | "marked") =>
  sql<QueueItem[]>`select ${submissionCols}, le.name as learner_name, le.email as learner_email, l.title as lesson_title, l.slug as lesson_slug,
      co.title as course_title, co.slug as course_slug
    from submissions s join learners le on le.user_id = s.user_id join lessons l on l.id = s.lesson_id
    join modules m on m.id = l.module_id join courses co on co.id = m.course_id
    where ${status === "submitted"} = (s.status = 'submitted')
    order by ${status === "submitted" ? sql`s.created_at asc` : sql`s.marked_at desc`} limit 200`;

export const submissionById = async (id: number): Promise<QueueItem | undefined> =>
  (await sql<QueueItem[]>`select ${submissionCols}, le.name as learner_name, le.email as learner_email, l.title as lesson_title, l.slug as lesson_slug,
      co.title as course_title, co.slug as course_slug
    from submissions s join learners le on le.user_id = s.user_id join lessons l on l.id = s.lesson_id
    join modules m on m.id = l.module_id join courses co on co.id = m.course_id where s.id = ${id}`)[0];

export const submissionsByUser = (userId: string) =>
  sql<QueueItem[]>`select ${submissionCols}, le.name as learner_name, le.email as learner_email, l.title as lesson_title, l.slug as lesson_slug,
      co.title as course_title, co.slug as course_slug
    from submissions s join learners le on le.user_id = s.user_id join lessons l on l.id = s.lesson_id
    join modules m on m.id = l.module_id join courses co on co.id = m.course_id where s.user_id = ${userId} order by s.created_at desc limit 100`;

export const toMarkCount = async () => (await sql<{ n: number }[]>`select count(*)::int as n from submissions where status = 'submitted'`)[0].n;

export const mark = (id: number, status: "passed" | "redo", feedback: string, by: string) =>
  sql`update submissions set status = ${status}, feedback = ${feedback}, marked_by = ${by}, marked_at = now() where id = ${id}`;

// grantUpload records that an upload address went to this learner, so only they can hand it in.
export const grantUpload = (g: { upload_id: string; user_id: string; filename: string; content_type: string; bytes: number }) =>
  sql`insert into upload_grants (upload_id, user_id, filename, content_type, bytes)
    values (${g.upload_id}, ${g.user_id}, ${g.filename}, ${g.content_type}, ${g.bytes}) on conflict do nothing`;

// grantedFiles returns those of the given uploads that went to this learner, as file references.
export const grantedFiles = async (userId: string, ids: string[]): Promise<FileRef[]> =>
  ids.length === 0
    ? []
    : sql<FileRef[]>`select upload_id as id, filename as name, bytes::float8 as size, content_type as type from upload_grants
        where user_id = ${userId} and upload_id in ${sql(ids)}`;

// fileOwner is the learner an uploaded file belongs to, if any.
export const fileOwner = async (uploadId: string) =>
  (await sql<{ user_id: string; filename: string }[]>`select user_id, filename from upload_grants where upload_id = ${uploadId}`)[0];

// ----- Change log -----

export const audit = (actor: string, action: string, subject = "", detail: Record<string, unknown> = {}) =>
  sql`insert into audit (actor, action, subject, detail) values (${actor}, ${action}, ${subject}, ${sql.json(detail as Record<string, string>)})`;

export type AuditRow = { id: number; at: Date; actor: string; action: string; subject: string; detail: Record<string, unknown> };
export const auditLog = (before?: number) =>
  sql<AuditRow[]>`select id, at, actor, action, subject, detail from audit where (${before ?? null}::bigint is null or id < ${before ?? null}) order by id desc limit 100`;

export const auditFor = (subject: string) =>
  sql<AuditRow[]>`select id, at, actor, action, subject, detail from audit where subject = ${subject} order by id desc limit 50`;

// ----- Groups -----

export const groupById = async (id: number): Promise<Group | undefined> => (await groups()).find((g) => g.id === id);
export const createGroup = async (name: string): Promise<number | undefined> =>
  (await sql<{ id: number }[]>`insert into groups (name) values (${name}) on conflict (name) do nothing returning id`)[0]?.id;
export const renameGroup = async (id: number, name: string): Promise<boolean> =>
  (await sql`update groups set name = ${name} where id = ${id} and not exists (select 1 from groups where name = ${name} and id <> ${id})`).count > 0;
export const deleteGroup = (id: number) => sql`delete from groups where id = ${id}`;
export const groupMembers = (groupId: number) => learners({ group: groupId });

// ----- Email -----

export type Email = { id: number; kind: string; to_email: string; subject: string; html: string; text: string; status: string; error: string; created_at: Date; sent_at: Date | null };

export const queueEmail = async (m: { kind: string; to: string; subject: string; html: string; text: string }): Promise<number> =>
  (await sql<{ id: number }[]>`insert into emails (kind, to_email, subject, html, text) values (${m.kind}, ${m.to}, ${m.subject}, ${m.html}, ${m.text}) returning id`)[0].id;
export const emailById = async (id: number): Promise<Email | undefined> => (await sql<Email[]>`select * from emails where id = ${id}`)[0];
export const markEmail = (id: number, status: "sent" | "failed" | "skipped" | "demo", error = "") =>
  sql`update emails set status = ${status}, error = ${error.slice(0, 500)}, sent_at = case when ${status} = 'sent' then now() else sent_at end where id = ${id}`;
export const recentEmails = () => sql<Email[]>`select id, kind, to_email, subject, '' as html, '' as text, status, error, created_at, sent_at from emails order by id desc limit 30`;

// ----- API keys -----

export type ApiKey = { id: number; label: string; prefix: string; scope: "read" | "write"; created_by: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// createKey makes a key and keeps only its hash; the caller shows the key once.
export const createKey = async (label: string, scope: "read" | "write", by: string): Promise<string> => {
  const key = `trn_${randomBytes(24).toString("base64url")}`;
  await sql`insert into api_keys (label, prefix, hash, scope, created_by) values (${label}, ${key.slice(0, 10)}, ${hashKey(key)}, ${scope}, ${by})`;
  return key;
};
export const keyFor = async (key: string): Promise<ApiKey | undefined> => {
  const [k] = await sql<ApiKey[]>`update api_keys set last_used_at = now() where hash = ${hashKey(key)} and revoked_at is null
    returning id, label, prefix, scope, created_by, created_at, last_used_at, revoked_at`;
  return k;
};
export const apiKeys = () => sql<ApiKey[]>`select id, label, prefix, scope, created_by, created_at, last_used_at, revoked_at from api_keys order by revoked_at nulls first, id desc`;
export const revokeKey = (id: number) => sql`update api_keys set revoked_at = now() where id = ${id} and revoked_at is null`;

// ----- Webhooks -----

export type Webhook = { id: number; url: string; secret: string; events: string[]; active: boolean; created_by: string; created_at: Date };
export type Delivery = { id: number; webhook_id: number; event: string; payload: unknown; status: string; attempts: number; last_status: number | null; last_error: string; created_at: Date; delivered_at: Date | null };

export const webhooks = () => sql<Webhook[]>`select id, url, secret, events, active, created_by, created_at from webhooks order by id`;
export const webhookById = async (id: number): Promise<Webhook | undefined> => (await sql<Webhook[]>`select * from webhooks where id = ${id}`)[0];
export const createWebhook = async (url: string, events: string[], by: string): Promise<Webhook> => {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [w] = await sql<Webhook[]>`insert into webhooks (url, secret, events, created_by) values (${url}, ${secret}, ${events}, ${by}) returning *`;
  return w;
};
export const updateWebhook = (id: number, url: string, events: string[], active: boolean) =>
  sql`update webhooks set url = ${url}, events = ${events}, active = ${active} where id = ${id}`;
export const deleteWebhook = (id: number) => sql`delete from webhooks where id = ${id}`;
export const hooksFor = (event: string) => sql<Webhook[]>`select * from webhooks where active and ${event} = any(events)`;

export const recordDelivery = async (webhookId: number, event: string, payload: unknown): Promise<number> =>
  (await sql<{ id: number }[]>`insert into deliveries (webhook_id, event, payload) values (${webhookId}, ${event}, ${sql.json(payload as Record<string, string>)}) returning id`)[0].id;
export const deliveryById = async (id: number): Promise<(Delivery & { url: string; secret: string; active: boolean }) | undefined> =>
  (await sql<(Delivery & { url: string; secret: string; active: boolean })[]>`select d.*, w.url, w.secret, w.active from deliveries d
    join webhooks w on w.id = d.webhook_id where d.id = ${id}`)[0];
export const deliveryAttempt = (id: number, status: number | null, error: string) =>
  sql`update deliveries set attempts = attempts + 1, last_status = ${status}, last_error = ${error.slice(0, 500)},
    status = case when ${status ?? 0}::int between 200 and 299 then 'delivered' else status end,
    delivered_at = case when ${status ?? 0}::int between 200 and 299 then now() else delivered_at end where id = ${id}`;
export const holdDelivery = (id: number) => sql`update deliveries set status = 'demo', last_error = 'Demo: recorded, not delivered.' where id = ${id} and status = 'pending'`;
export const deliveryFailed = (id: number) => sql`update deliveries set status = 'failed' where id = ${id} and status = 'pending'`;
export const recentDeliveries = (webhookId: number) =>
  sql<Delivery[]>`select id, webhook_id, event, payload, status, attempts, last_status, last_error, created_at, delivered_at from deliveries
    where webhook_id = ${webhookId} order by id desc limit 20`;

// ----- Reminders -----

export type ReminderRow = {
  user_id: string;
  email: string;
  name: string;
  status: "invited" | "active";
  invite_url: string;
  last_seen: Date | null;
  reminded_at: Date | null;
  courses: { title: string; slug: string; due_on: string | null; done: number; required: number }[];
};

// reminderCandidates is everyone still in the portal with an enrolled course they have not
// finished; the caller decides who is due a nudge.
export const reminderCandidates = () =>
  sql<ReminderRow[]>`
    with mine as (
      select user_id, course_id, due_on from enrolments
      union all
      select le.user_id, gc.course_id, gc.due_on from group_courses gc join learners le on le.group_id = gc.group_id
    ), per as (
      select m.user_id, m.course_id, min(m.due_on) as due_on from mine m group by m.user_id, m.course_id
    ), counts as (
      select per.*, co.title, co.slug,
        (select count(*)::int from progress p join lessons l on l.id = p.lesson_id join modules mo on mo.id = l.module_id
          where p.user_id = per.user_id and mo.course_id = per.course_id and not l.optional) as done,
        (select count(*)::int from lessons l join modules mo on mo.id = l.module_id where mo.course_id = per.course_id and not l.optional) as required
      from per join courses co on co.id = per.course_id and co.published
    )
    select le.user_id, le.email, le.name, le.status, le.invite_url, case when le.status = 'invited' then null else le.last_seen end as last_seen, le.reminded_at,
      json_agg(json_build_object('title', c.title, 'slug', c.slug, 'due_on', c.due_on, 'done', c.done, 'required', c.required) order by c.due_on nulls last, c.title) as courses
    from learners le join counts c on c.user_id = le.user_id and c.done < c.required
    where le.status in ('invited', 'active') and le.email <> ''
    group by le.user_id`;
export const markReminded = (userId: string) => sql`update learners set reminded_at = now() where user_id = ${userId}`;

// ----- Export -----

export type ProgressExport = {
  email: string;
  name: string;
  group_name: string | null;
  status: string;
  course: string;
  enrolled: boolean;
  due_on: string | null;
  done: number;
  required: number;
  completed_at: Date | null;
  certificate: string | null;
  last_seen: Date;
};

// progressExport is one row per person per course they are enrolled in or have started.
export const progressExport = () =>
  sql<ProgressExport[]>`
    with mine as (
      select user_id, course_id, due_on from enrolments
      union all
      select le.user_id, gc.course_id, gc.due_on from group_courses gc join learners le on le.group_id = gc.group_id
      union all
      select distinct p.user_id, m.course_id, null::date from progress p join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id
    ), per as (select user_id, course_id, min(due_on)::text as due_on from mine group by user_id, course_id)
    select le.email, le.name, g.name as group_name, le.status, co.title as course,
      exists (select 1 from enrolments e where e.user_id = le.user_id and e.course_id = co.id)
        or exists (select 1 from group_courses gc where gc.group_id = le.group_id and gc.course_id = co.id) as enrolled,
      per.due_on,
      (select count(*)::int from progress p join lessons l on l.id = p.lesson_id join modules m on m.id = l.module_id
        where p.user_id = le.user_id and m.course_id = co.id and not l.optional) as done,
      (select count(*)::int from lessons l join modules m on m.id = l.module_id where m.course_id = co.id and not l.optional) as required,
      c.issued_at as completed_at, c.code as certificate, le.last_seen
    from per join learners le on le.user_id = per.user_id join courses co on co.id = per.course_id
    left join groups g on g.id = le.group_id left join certificates c on c.user_id = le.user_id and c.course_id = co.id
    order by le.email, co.position`;

// reorder writes positions 0..n in the given order.
export const reorder = async (table: "courses" | "modules" | "lessons" | "questions", ids: number[]) => {
  await sql.begin(async (tx) => {
    for (const [i, id] of ids.entries()) await tx`update ${tx(table)} set position = ${i} where id = ${id}`;
  });
};
