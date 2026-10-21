// Pure decisions about courses: ordering, progress, grading. No database, no requests; the
// routes load rows, call these, and render or store what comes back.
import { createHmac } from "node:crypto";

export type Kind = "read" | "video" | "quiz" | "assignment";
export type Access = "open" | "enrolled";

export type Course = { id: number; slug: string; title: string; summary: string; published: boolean; position: number; access: Access };
export type Module = { id: number; course_id: number; position: number; title: string; summary: string };
export type Lesson = {
  id: number;
  module_id: number;
  position: number;
  slug: string;
  title: string;
  kind: Kind;
  depth: number;
  optional: boolean;
  minutes: number;
  body: string;
  video_upload_id: string | null;
  pass_mark: number;
};
export type Choice = { text: string; correct: boolean };
export type Question = { id: number; lesson_id: number; position: number; prompt: string; choices: Choice[]; explanation: string };

export type ModuleOutline = Module & { number: number; lessons: Lesson[] };

const byPosition = <T extends { position: number; id: number }>(a: T, b: T) => a.position - b.position || a.id - b.id;

// outline groups lessons under their modules, both in display order, and numbers the modules.
export const outline = (modules: Module[], lessons: Lesson[]): ModuleOutline[] =>
  [...modules].sort(byPosition).map((m, i) => ({
    ...m,
    number: i + 1,
    lessons: lessons.filter((l) => l.module_id === m.id).sort(byPosition),
  }));

export const flatLessons = (o: ModuleOutline[]): Lesson[] => o.flatMap((m) => m.lessons);

export const neighbors = (o: ModuleOutline[], lessonId: number): { prev?: Lesson; next?: Lesson } => {
  const all = flatLessons(o);
  const i = all.findIndex((l) => l.id === lessonId);
  return i < 0 ? {} : { prev: all[i - 1], next: all[i + 1] };
};

export type Progress = {
  done: number;
  required: number;
  percent: number;
  complete: boolean;
  started: boolean;
  next?: Lesson;
};

// courseProgress counts only lessons that are not optional. The next lesson is the first
// required one still to do, else the first optional one, else none.
export const courseProgress = (o: ModuleOutline[], completed: ReadonlySet<number>): Progress => {
  const all = flatLessons(o);
  const required = all.filter((l) => !l.optional);
  const done = required.filter((l) => completed.has(l.id)).length;
  const next = required.find((l) => !completed.has(l.id)) ?? all.find((l) => !completed.has(l.id));
  return {
    done,
    required: required.length,
    percent: required.length === 0 ? 0 : Math.round((done / required.length) * 100),
    complete: required.length > 0 && done === required.length,
    started: all.some((l) => completed.has(l.id)),
    next,
  };
};

export const courseMinutes = (o: ModuleOutline[]) => flatLessons(o).reduce((sum, l) => sum + l.minutes, 0);

export type Graded = {
  score: number;
  total: number;
  passed: boolean;
  results: { questionId: number; chosen: number | null; correct: number; right: boolean }[];
};

// grade marks each question right when the chosen index is the correct choice. A quiz passes
// when the score reaches pass_mark percent; a quiz with no questions passes.
export const grade = (questions: Question[], answers: Record<number, number | undefined>, passMark: number): Graded => {
  const results = questions.map((q) => {
    const chosen = answers[q.id] ?? null;
    const correct = q.choices.findIndex((c) => c.correct);
    return { questionId: q.id, chosen, correct, right: chosen !== null && chosen === correct };
  });
  const score = results.filter((r) => r.right).length;
  const total = questions.length;
  return { score, total, passed: total === 0 || score * 100 >= passMark * total, results };
};

// questionProblems says what stops a question from being saved, or nothing when it is valid.
export const questionProblems = (prompt: string, choices: Choice[]): string[] => [
  ...(prompt.trim() ? [] : ["Write the question."]),
  ...(choices.length >= 2 ? [] : ["Give at least two answers."]),
  ...(choices.filter((c) => c.correct).length === 1 ? [] : ["Mark exactly one answer as correct."]),
];

export const slugify = (s: string, fallback = "item") =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "") || fallback;

// uniqueSlug adds -2, -3… until the slug is not taken.
export const uniqueSlug = (base: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

// moved returns the ids in their new order after moving one up or down a place.
export const moved = (ids: number[], id: number, dir: "up" | "down"): number[] => {
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

export const isColor = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const duration = (minutes: number) =>
  minutes < 60 ? plural(minutes, "minute") : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();

// ----- People and access -----

export type Viewer = {
  editor: boolean;
  status: "invited" | "active" | "removed" | "new";
  // Courses the person is enrolled in, on their own or through their group, with any due date.
  enrolled: ReadonlyMap<number, Date | null>;
};

// mayTake says whether a person may open a course's lessons. Editors always may; a removed
// learner never may; an open course is for every learner; an enrolled course needs enrollment.
export const mayTake = (course: Pick<Course, "id" | "access" | "published">, v: Viewer): boolean => {
  if (v.editor) return true;
  if (v.status === "removed" || !course.published) return false;
  return course.access === "open" || v.enrolled.has(course.id);
};

export type Due = "none" | "later" | "soon" | "overdue" | "done";

// dueState places a due date against today: overdue once the day has passed, soon within a week.
export const dueState = (due: Date | null | undefined, complete: boolean, today: Date): Due => {
  if (complete) return "done";
  if (!due) return "none";
  const day = 86_400_000;
  const days = Math.floor((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / day);
  return days < 0 ? "overdue" : days <= 7 ? "soon" : "later";
};

// earliest keeps the sooner of two due dates, treating none as later than any date.
export const earliest = (a: Date | null | undefined, b: Date | null | undefined): Date | null => (!a ? b ?? null : !b ? a : a < b ? a : b);

export type InviteRow = { email: string; name: string; group: string };
export type InviteProblem = { line: number; text: string; why: string };

const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);

// parseInvites reads one person per line as "email", "email, name" or "email, name, group";
// tabs work too, so a pasted spreadsheet column works. A header line and blank lines are
// skipped, and a repeated email keeps its first line.
export const parseInvites = (text: string): { rows: InviteRow[]; problems: InviteProblem[] } => {
  const lines = text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t.trim() })).filter((l) => l.text);
  const parsed = lines
    .filter((l, i) => !(i === 0 && /^e-?mail\b/i.test(l.text)))
    .map((l) => {
      const [email = "", name = "", group = ""] = l.text.split(/\t|,|;/).map((c) => c.trim().replace(/^"|"$/g, ""));
      return { ...l, email: email.toLowerCase(), name, group };
    });
  const seen = new Set<string>();
  return parsed.reduce(
    (acc, p) => {
      if (!emailOk(p.email)) return { ...acc, problems: [...acc.problems, { line: p.line, text: p.text, why: "Not an email address." }] };
      if (seen.has(p.email)) return { ...acc, problems: [...acc.problems, { line: p.line, text: p.text, why: "Already on an earlier line." }] };
      seen.add(p.email);
      return { ...acc, rows: [...acc.rows, { email: p.email, name: p.name.slice(0, 120), group: p.group.slice(0, 80) }] };
    },
    { rows: [] as InviteRow[], problems: [] as InviteProblem[] },
  );
};

// reminderDue says whether a learner with unfinished enrolled courses should get a nudge: not
// seen for a week, and not reminded in the last week.
export const reminderDue = (lastSeen: Date | null, remindedAt: Date | null, now: Date, days = 7) => {
  const gap = days * 86_400_000;
  return (!lastSeen || now.getTime() - lastSeen.getTime() >= gap) && (!remindedAt || now.getTime() - remindedAt.getTime() >= gap);
};

// csv writes rows as RFC 4180 text. Cells that a spreadsheet would run as a formula get a
// leading quote mark.
export const csv = (rows: (string | number | null | undefined)[][]) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s0 = v === null || v === undefined ? "" : String(v);
          const s = /^[=+\-@\t\r]/.test(s0) ? `'${s0}` : s0;
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n") + "\r\n";

// ----- Integrations -----

export const webhookEvents = [
  "learner.invited",
  "learner.enrolled",
  "learner.removed",
  "lesson.completed",
  "quiz.passed",
  "quiz.failed",
  "assignment.submitted",
  "assignment.marked",
  "course.completed",
] as const;
export type WebhookEvent = (typeof webhookEvents)[number];

export const isPublicUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
};

// keyFrom reads the API key a request carries: Authorization: Bearer <key>, Basic auth with the
// key as the user name, X-Api-Key, or ?token=. The first one present wins.
export const keyFrom = (header: (name: string) => string | undefined, token?: string): string => {
  const auth = (header("authorization") ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  const basic = /^basic\s+(.+)$/i.exec(auth)?.[1];
  const user = basic ? Buffer.from(basic.trim(), "base64").toString("utf8").split(":")[0] : undefined;
  return (bearer ?? user ?? header("x-api-key") ?? token ?? "").trim();
};

// webhookSignature signs a delivery the way Stripe-style receivers expect: "t=<unix seconds>,
// v1=<hex HMAC-SHA256 of "<t>.<body>">". Receivers recompute it with their secret and refuse a
// delivery older than a few minutes.
export const webhookSignature = (secret: string, t: number, body: string) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

// ----- Email -----

export type MailMode = "whisk" | "off";

// mailOn says whether the portal sends email. It goes through Whisk email, from the business's
// own address when one is set (on a domain verified in Whisk), else from Whisk's.
export const mailOn = (s: { mail_mode: MailMode }) => s.mail_mode === "whisk";

export const isEmail = emailOk;

// isDay accepts a calendar date as a date input sends it (2026-03-31).
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

// ----- Coursework -----

export const maxFiles = 10;
export const maxFileBytes = 200 * 1024 ** 2;

export type SubmissionStatus = "submitted" | "passed" | "redo";

// courseworkState reads a learner's submissions for one assignment, newest first: nothing yet,
// waiting to be marked, passed, or sent back to try again. A learner may hand in when there
// is nothing yet or the last one came back as redo.
export const courseworkState = (subs: { status: SubmissionStatus }[]): { state: SubmissionStatus | "none"; canSubmit: boolean } => {
  const latest = subs.at(0);
  return { state: latest?.status ?? "none", canSubmit: !latest || latest.status === "redo" };
};

// fileProblems says why a set of files cannot be handed in, or nothing when it can.
export const fileProblems = (files: { size: number }[]) => [
  ...(files.length === 0 ? ["Add at least one file."] : []),
  ...(files.length > maxFiles ? [`Hand in at most ${maxFiles} files.`] : []),
  ...(files.some((f) => !(f.size > 0) || f.size > maxFileBytes) ? ["Each file must be smaller than 200 MB."] : []),
];

export const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;
