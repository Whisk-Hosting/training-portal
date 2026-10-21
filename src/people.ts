// The things staff and the API do to people: invite, enroll, remove, finish, mark. Each one
// changes the rows, writes the change log, tells other systems through webhooks and emails the
// person when it should. The editor pages and the API both call these, so they behave alike.
import { certificateEmail, enrolledEmail, inviteEmail, markedEmail, submittedEmail } from "./emails.js";
import { baseUrl, courseRef, email, emit, learnerRef, lessonRef } from "./events.js";
import { mailIsOn } from "./mail.js";
import { courseProgress, type Course, type InviteRow, type Lesson } from "./model.js";
import * as store from "./store.js";
import { log, whiskApi } from "./whisk.js";

export type InviteResult = {
  email: string;
  name: string;
  outcome: "added" | "again" | "failed";
  user_id?: string;
  link?: string;
  emailed: boolean;
  error?: string;
};

type Customer = { id: string; email: string; invite_url?: string };

// invitePeople adds each person as a customer of this app (Whisk keeps their sign-in), records
// them as a learner, enrolls them, and emails their link when email is on and asked for. One
// person failing does not stop the rest.
export const invitePeople = async (
  rows: InviteRow[],
  opts: { courses: Course[]; due: string | null; groupId: number | null; sendEmail: boolean; actor: string },
): Promise<InviteResult[]> => {
  const s = await store.settings();
  const emailing = opts.sendEmail && mailIsOn(s);
  const results: InviteResult[] = [];
  for (const r of rows) {
    try {
      const before = await store.learnerByEmail(r.email);
      const groupId = r.group ? await store.groupByName(r.group) : opts.groupId;
      const cust = await whiskApi<Customer>("/customers", { email: r.email, name: r.name });
      await store.addLearner({ user_id: cust.id, email: r.email, name: r.name, group_id: groupId, invite_url: cust.invite_url ?? "" });
      for (const c of opts.courses) await store.enrol(cust.id, c.id, opts.due, opts.actor);
      await store.audit(opts.actor, before ? "Invited again" : "Invited", cust.id, { email: r.email, courses: opts.courses.map((c) => c.title).join(", ") });
      const l = (await store.learner(cust.id))!;
      await emit("learner.invited", { learner: learnerRef(l) });
      for (const c of opts.courses) await emit("learner.enrolled", { learner: learnerRef(l), course: courseRef(c), due_on: opts.due });
      const link = l.status === "active" ? `${baseUrl()}/me` : cust.invite_url ?? "";
      if (emailing) await email("invite", inviteEmail(s, { to: r.email, name: l.name, link, courses: opts.courses.map((c) => ({ title: c.title, due_on: opts.due })) }));
      results.push({ email: r.email, name: l.name, outcome: before ? "again" : "added", user_id: cust.id, link, emailed: emailing });
    } catch (err) {
      const api = (err as { api?: { message?: string } }).api;
      log.warn({ err: String(err), email: r.email }, "invite failed");
      results.push({ email: r.email, name: r.name, outcome: "failed", emailed: false, error: api?.message ?? "Whisk could not add them. Try again in a minute." });
    }
  }
  return results;
};

// resendInvite asks Whisk for the person's link again and emails it.
export const resendInvite = async (userId: string, actor: string): Promise<{ link: string; emailed: boolean }> => {
  const l = await store.learner(userId);
  if (!l) throw new Error("No such learner.");
  const cust = await whiskApi<Customer>("/customers", { email: l.email, name: l.name });
  await store.addLearner({ user_id: l.user_id, email: l.email, name: l.name, group_id: l.group_id, invite_url: cust.invite_url ?? l.invite_url });
  const s = await store.settings();
  const courses = (await store.learnerCourses(userId)).filter((c) => c.enrolled && !c.certificate);
  const link = l.status === "active" ? `${baseUrl()}/me` : cust.invite_url ?? "";
  const emailing = mailIsOn(s);
  if (emailing)
    await email("invite", inviteEmail(s, { to: l.email, name: l.name, link, courses: courses.map((c) => ({ title: c.title, due_on: c.due_on ? new Date(c.due_on).toISOString().slice(0, 10) : null })) }));
  await store.audit(actor, "Sent the invite again", userId, { email: l.email });
  return { link, emailed: emailing };
};

// enrolPerson gives one person a course, with an optional due date, and tells them.
export const enrolPerson = async (userId: string, course: Course, due: string | null, actor: string, notify: boolean) => {
  const l = await store.learner(userId);
  if (!l) throw new Error("No such learner.");
  await store.enrol(userId, course.id, due, actor);
  await store.audit(actor, "Enrolled", userId, { course: course.title, due_on: due ?? "" });
  await emit("learner.enrolled", { learner: learnerRef(l), course: courseRef(course), due_on: due });
  const s = await store.settings();
  if (notify && l.status !== "removed")
    await email("enrolled", enrolledEmail(s, { to: l.email, name: l.name, course: course.title, due_on: due, link: l.status === "invited" && l.invite_url ? l.invite_url : `${baseUrl()}/courses/${course.slug}` }));
};

export const unenrolPerson = async (userId: string, course: Course, actor: string) => {
  await store.unenrol(userId, course.id);
  await store.audit(actor, "Took out of a course", userId, { course: course.title });
};

// enrolGroup gives a whole group a course; members joining later get it too.
export const enrolGroup = async (groupId: number, course: Course, due: string | null, actor: string, notify: boolean) => {
  await store.enrolGroup(groupId, course.id, due);
  const g = await store.groupById(groupId);
  await store.audit(actor, "Gave a group a course", `group:${groupId}`, { group: g?.name ?? "", course: course.title, due_on: due ?? "" });
  const members = (await store.groupMembers(groupId)).filter((m) => m.status !== "removed");
  const s = await store.settings();
  for (const m of members) {
    await emit("learner.enrolled", { learner: learnerRef(m), course: courseRef(course), due_on: due });
    if (notify)
      await email("enrolled", enrolledEmail(s, { to: m.email, name: m.name, course: course.title, due_on: due, link: m.status === "invited" && m.invite_url ? m.invite_url : `${baseUrl()}/courses/${course.slug}` }));
  }
};

export const setStatus = async (userId: string, status: "active" | "removed", actor: string) => {
  const l = await store.learner(userId);
  if (!l) throw new Error("No such learner.");
  await store.setLearnerStatus(userId, status);
  await store.audit(actor, status === "removed" ? "Removed access" : "Gave access back", userId, { email: l.email });
  if (status === "removed") await emit("learner.removed", { learner: learnerRef(l) });
};

// finished issues the certificate the first time a person's progress completes a course, and
// sends the news. It answers true when this call finished the course.
export const finished = async (userId: string, course: Course, fallbackName = "Learner"): Promise<boolean> => {
  const [o, done] = await Promise.all([store.courseOutline(course.id), store.completedIn(userId, course.id)]);
  if (!courseProgress(o, done).complete) return false;
  const l = await store.learner(userId);
  const cert = await store.issueCertificate(userId, l?.name || l?.email || fallbackName, course);
  if (!cert.fresh) return false;
  const url = `${baseUrl()}/verify/${cert.code}`;
  if (l) {
    await emit("course.completed", { learner: learnerRef(l), course: courseRef(course), certificate: { code: cert.code, url } });
    if (l.email) await email("certificate", certificateEmail(await store.settings(), { to: l.email, name: l.name, course: course.title, link: url }));
  }
  return true;
};

export const lessonDone = async (userId: string, course: Course, lesson: Lesson) => {
  const l = await store.learner(userId);
  if (l) await emit("lesson.completed", { learner: learnerRef(l), course: courseRef(course), lesson: lessonRef(lesson) });
};

// handIn records a learner's coursework and tells the trainers.
export const handIn = async (userId: string, course: Course, lesson: Lesson, note: string, files: store.FileRef[]) => {
  const id = await store.submit(userId, lesson.id, note, files);
  const l = await store.learner(userId);
  if (l) await emit("assignment.submitted", { learner: learnerRef(l), course: courseRef(course), lesson: lessonRef(lesson), submission: { id, note, files } });
  const s = await store.settings();
  if (s.notify_email)
    await email("submitted", submittedEmail(s, { to: s.notify_email, learner: l?.name || l?.email || "A learner", lesson: lesson.title, course: course.title, link: `${baseUrl()}/edit/marking/${id}` }));
  return id;
};

// markWork records a trainer's verdict. A pass completes the lesson and may finish the course.
export const markWork = async (id: number, verdict: "passed" | "redo", feedback: string, actor: string) => {
  const sub = await store.submissionById(id);
  if (!sub) throw new Error("No such submission.");
  await store.mark(id, verdict, feedback, actor);
  const [lesson, l] = await Promise.all([store.lessonById(sub.lesson_id), store.learner(sub.user_id)]);
  const course = lesson ? await store.courseById(lesson.course_id) : undefined;
  if (!lesson || !course) return;
  await store.audit(actor, verdict === "passed" ? "Passed coursework" : "Sent coursework back", sub.user_id, { lesson: lesson.title, course: course.title });
  if (l) await emit("assignment.marked", { learner: learnerRef(l), course: courseRef(course), lesson: lessonRef(lesson), submission: { id, status: verdict, feedback } });
  if (verdict === "passed") {
    await store.complete(sub.user_id, lesson.id);
    await lessonDone(sub.user_id, course, lesson);
    await finished(sub.user_id, course);
  }
  if (l?.email)
    await email("marked", markedEmail(await store.settings(), { to: l.email, name: l.name, lesson: lesson.title, course: course.title, passed: verdict === "passed", feedback, link: `${baseUrl()}/learn/${course.slug}/${lesson.slug}#coursework` }));
};
