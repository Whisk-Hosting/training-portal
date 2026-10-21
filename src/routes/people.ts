// Staff pages for people: learners, adding them, groups, marking coursework, the change log
// and the CSV export. Trainers do most of it; removing people and changing progress by hand
// is for admins.
import type { Context, Hono } from "hono";
import { mailIsOn } from "../mail.js";
import { csv, isDay, parseInvites, type Course } from "../model.js";
import { enrolGroup, enrolPerson, finished, invitePeople, markWork, resendInvite, setStatus, unenrolPerson } from "../people.js";
import * as store from "../store.js";
import { message } from "../views/pages.js";
import { addLearnersPage, groupPage, groupsPage, inviteResultsPage, learnerPage, learnersPage, logPage, markingPage, submissionPage } from "../views/people.js";
import { actorName, flash, idParam, navFor, notFound, posInt, render, text, who } from "../web.js";
import { canAdmin, log } from "../whisk.js";

const due = (v: unknown) => {
  const d = text(v, 10);
  return isDay(d) ? d : null;
};

export const peopleRoutes = (app: Hono) => {
  const adminsOnly = async (c: Context, next: () => Promise<void>) => {
    if (!canAdmin(who(c)))
      return render(c, "Not allowed", message("Only admins can do this", "Ask an owner of this business to add you to its training-admins group."), { status: 403 });
    await next();
  };
  for (const action of ["remove", "restore", "reset", "complete", "revoke"]) app.use(`/edit/learners/:user/${action}`, adminsOnly);
  app.use("/edit/log", adminsOnly);

  const courseOf = async (v: unknown): Promise<Course | undefined> => (posInt(v) ? store.courseById(posInt(v)) : undefined);

  // ----- Learners -----

  app.get("/edit/learners", async (c) => {
    const f = { q: text(c.req.query("q"), 100), group: posInt(c.req.query("group")) || null, status: ["invited", "active", "removed"].includes(c.req.query("status") ?? "") ? c.req.query("status")! : "" };
    const [rows, groups, nav] = await Promise.all([store.learners({ q: f.q || undefined, group: f.group ?? undefined, status: f.status || undefined }), store.groups(), navFor(c)]);
    return render(c, "Learners", learnersPage(rows, groups, f, nav, flash(c)), { nav: "edit" });
  });

  app.get("/edit/learners/add", async (c) => {
    const [courses, groups, s, nav] = await Promise.all([store.courses(true), store.groups(), store.settings(), navFor(c)]);
    return render(c, "Add learners", addLearnersPage(courses, groups, mailIsOn(s), nav), { nav: "edit" });
  });

  app.post("/edit/learners/add", async (c) => {
    const f = await c.req.parseBody({ all: true });
    const pasted = typeof f.people === "string" ? f.people.slice(0, 200_000) : "";
    const { rows, problems } = parseInvites(pasted);
    const [all, groups, s, nav] = await Promise.all([store.courses(true), store.groups(), store.settings(), navFor(c)]);
    if (rows.length === 0)
      return render(c, "Add learners", addLearnersPage(all, groups, mailIsOn(s), nav, problems.length ? "None of those lines has an email address." : "Paste at least one email address.", pasted), { nav: "edit", status: 400 });
    if (rows.length > 500) return render(c, "Add learners", addLearnersPage(all, groups, mailIsOn(s), nav, "Add at most 500 people at a time.", pasted), { nav: "edit", status: 400 });
    const picked = (Array.isArray(f.course) ? f.course : [f.course]).map(posInt);
    const groupId = posInt(f.group) || null;
    const results = await invitePeople(rows, {
      courses: all.filter((co) => picked.includes(co.id)),
      due: due(f.due),
      groupId: groups.some((g) => g.id === groupId) ? groupId : null,
      sendEmail: f.send_email === "1",
      actor: actorName(who(c)),
    });
    return render(c, "Add learners", inviteResultsPage(results, problems, await navFor(c)), { nav: "edit" });
  });

  const errors: Record<string, string> = {
    course: "Pick a course.",
    invite: "Whisk could not send the invite again. Try again in a minute.",
    nogroup: "That group no longer exists.",
  };

  app.get("/edit/learners/:user", async (c) => {
    const r = await store.learner(c.req.param("user"));
    if (!r) return notFound(c, "learner");
    const [courses, allCourses, groups, work, changes, s, nav] = await Promise.all([
      store.learnerCourses(r.user_id),
      store.courses(true),
      store.groups(),
      store.submissionsByUser(r.user_id),
      store.auditFor(r.user_id),
      store.settings(),
      navFor(c),
    ]);
    return render(
      c,
      r.name || r.email,
      learnerPage({ r, courses, allCourses, groups, work, changes, nav, flash: flash(c), error: errors[c.req.query("err") ?? ""], link: r.status === "invited" ? r.invite_url : undefined, mailOn: mailIsOn(s) }),
      { nav: "edit" },
    );
  });

  // person loads the learner in the URL for an action, and where to go back to.
  const person = async (c: Context) => {
    const r = await store.learner(c.req.param("user")!);
    return r ? { r, back: `/edit/learners/${encodeURIComponent(r.user_id)}`, actor: actorName(who(c)), f: await c.req.parseBody() } : undefined;
  };

  app.post("/edit/learners/:user/enrol", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const course = await courseOf(p.f.course);
    if (!course) return c.redirect(`${p.back}?err=course`);
    await enrolPerson(p.r.user_id, course, due(p.f.due), p.actor, p.f.notify === "1");
    return c.redirect(`${p.back}?ok=enrolled`);
  });

  app.post("/edit/learners/:user/unenrol", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const course = await courseOf(p.f.course);
    if (course) await unenrolPerson(p.r.user_id, course, p.actor);
    return c.redirect(`${p.back}?ok=saved`);
  });

  app.post("/edit/learners/:user/group", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const groupId = posInt(p.f.group) || null;
    const g = groupId ? await store.groupById(groupId) : undefined;
    if (groupId && !g) return c.redirect(`${p.back}?err=nogroup`);
    await store.setLearnerGroup(p.r.user_id, groupId);
    await store.audit(p.actor, "Changed group", p.r.user_id, { group: g?.name ?? "none" });
    return c.redirect(`${p.back}?ok=saved`);
  });

  app.post("/edit/learners/:user/resend", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    try {
      const { emailed } = await resendInvite(p.r.user_id, p.actor);
      return c.redirect(`${p.back}?ok=${emailed ? "resent" : "resent_link"}`);
    } catch (err) {
      log.warn({ err: String(err) }, "resend failed");
      return c.redirect(`${p.back}?err=invite`);
    }
  });

  app.post("/edit/learners/:user/remove", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    await setStatus(p.r.user_id, "removed", p.actor);
    return c.redirect(`${p.back}?ok=removed`);
  });

  app.post("/edit/learners/:user/restore", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    await setStatus(p.r.user_id, "active", p.actor);
    return c.redirect(`${p.back}?ok=restored`);
  });

  app.post("/edit/learners/:user/reset", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const course = await courseOf(p.f.course);
    if (!course) return c.redirect(`${p.back}?err=course`);
    await store.resetProgress(p.r.user_id, course.id);
    await store.audit(p.actor, "Cleared progress", p.r.user_id, { course: course.title });
    return c.redirect(`${p.back}?ok=reset`);
  });

  app.post("/edit/learners/:user/complete", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const course = await courseOf(p.f.course);
    if (!course) return c.redirect(`${p.back}?err=course`);
    await store.completeCourse(p.r.user_id, course.id);
    await store.audit(p.actor, "Marked a course finished", p.r.user_id, { course: course.title });
    await finished(p.r.user_id, course);
    return c.redirect(`${p.back}?ok=completed`);
  });

  app.post("/edit/learners/:user/revoke", async (c) => {
    const p = await person(c);
    if (!p) return notFound(c, "learner");
    const cert = await store.certificate(text(p.f.code, 40));
    if (cert && cert.user_id === p.r.user_id) {
      await store.revokeCertificate(cert.code);
      await store.audit(p.actor, "Withdrew a certificate", p.r.user_id, { course: cert.course_title });
    }
    return c.redirect(`${p.back}?ok=revoked`);
  });

  // ----- Groups -----

  app.get("/edit/groups", async (c) => {
    const err: Record<string, string> = { name: "A group with that name already exists." };
    return render(c, "Groups", groupsPage(await store.groups(), await navFor(c), flash(c), err[c.req.query("err") ?? ""]), { nav: "edit" });
  });

  app.post("/edit/groups", async (c) => {
    const name = text((await c.req.parseBody()).name, 80);
    if (!name) return c.redirect("/edit/groups");
    const id = await store.createGroup(name);
    if (!id) return c.redirect("/edit/groups?err=name");
    await store.audit(actorName(who(c)), "Made a group", `group:${id}`, { group: name });
    return c.redirect(`/edit/groups/${id}?ok=created`);
  });

  app.get("/edit/groups/:id", async (c) => {
    const g = await store.groupById(idParam(c));
    if (!g) return notFound(c, "group");
    const [members, courses, s, nav] = await Promise.all([store.groupMembers(g.id), store.courses(true), store.settings(), navFor(c)]);
    const err: Record<string, string> = { name: "A group with that name already exists.", course: "Pick a course." };
    return render(c, g.name, groupPage(g, members, courses, mailIsOn(s), nav, flash(c), err[c.req.query("err") ?? ""]), { nav: "edit" });
  });

  app.post("/edit/groups/:id", async (c) => {
    const g = await store.groupById(idParam(c));
    if (!g) return notFound(c, "group");
    const name = text((await c.req.parseBody()).name, 80);
    if (name && name !== g.name) {
      if (!(await store.renameGroup(g.id, name))) return c.redirect(`/edit/groups/${g.id}?err=name`);
      await store.audit(actorName(who(c)), "Renamed a group", `group:${g.id}`, { from: g.name, to: name });
    }
    return c.redirect(`/edit/groups/${g.id}?ok=saved`);
  });

  app.post("/edit/groups/:id/delete", async (c) => {
    const g = await store.groupById(idParam(c));
    if (!g) return notFound(c, "group");
    await store.deleteGroup(g.id);
    await store.audit(actorName(who(c)), "Deleted a group", "", { group: g.name });
    return c.redirect("/edit/groups?ok=deleted");
  });

  app.post("/edit/groups/:id/enrol", async (c) => {
    const g = await store.groupById(idParam(c));
    if (!g) return notFound(c, "group");
    const f = await c.req.parseBody();
    const course = await courseOf(f.course);
    if (!course) return c.redirect(`/edit/groups/${g.id}?err=course`);
    await enrolGroup(g.id, course, due(f.due), actorName(who(c)), f.notify === "1");
    return c.redirect(`/edit/groups/${g.id}?ok=enrolled`);
  });

  app.post("/edit/groups/:id/unenrol", async (c) => {
    const g = await store.groupById(idParam(c));
    if (!g) return notFound(c, "group");
    const course = await courseOf((await c.req.parseBody()).course);
    if (course) {
      await store.unenrolGroup(g.id, course.id);
      await store.audit(actorName(who(c)), "Took a group out of a course", `group:${g.id}`, { group: g.name, course: course.title });
    }
    return c.redirect(`/edit/groups/${g.id}?ok=saved`);
  });

  // ----- Marking -----

  app.get("/edit/marking", async (c) => {
    const which = c.req.query("show") === "marked" ? "marked" : "waiting";
    const [items, nav] = await Promise.all([store.markingQueue(which === "waiting" ? "submitted" : "marked"), navFor(c)]);
    return render(c, "To mark", markingPage(items, which, nav.toMark, nav), { nav: "edit" });
  });

  app.get("/edit/marking/:id", async (c) => {
    const w = await store.submissionById(idParam(c));
    if (!w) return notFound(c, "submission");
    const earlier = (await store.submissionsFor(w.user_id, w.lesson_id)).filter((s) => s.id !== w.id);
    const err: Record<string, string> = { verdict: "Choose Pass or Try again." };
    return render(c, `Mark: ${w.lesson_title}`, submissionPage(w, earlier, await navFor(c), flash(c), err[c.req.query("err") ?? ""]), { nav: "edit" });
  });

  app.post("/edit/marking/:id", async (c) => {
    const w = await store.submissionById(idParam(c));
    if (!w) return notFound(c, "submission");
    const f = await c.req.parseBody();
    const verdict = f.verdict === "passed" ? "passed" : f.verdict === "redo" ? "redo" : undefined;
    if (!verdict) return c.redirect(`/edit/marking/${w.id}?err=verdict`);
    await markWork(w.id, verdict, text(f.feedback, 5000), actorName(who(c)));
    // Straight on to the next piece of work, if there is one.
    const next = (await store.markingQueue("submitted"))[0];
    return c.redirect(next ? `/edit/marking/${next.id}?ok=marked` : "/edit/marking?ok=marked");
  });

  // ----- Change log and export -----

  app.get("/edit/log", async (c) => {
    const before = posInt(c.req.query("before")) || undefined;
    return render(c, "Change log", logPage(await store.auditLog(before), await navFor(c)), { nav: "edit" });
  });

  app.get("/edit/export/progress.csv", async (c) => {
    const rows = await store.progressExport();
    const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
    const body = csv([
      ["Email", "Name", "Group", "Status", "Course", "Enrolled", "Due", "Lessons done", "Lessons needed", "Finished", "Certificate", "Last seen"],
      ...rows.map((r) => [r.email, r.name, r.group_name ?? "", r.status, r.course, r.enrolled ? "yes" : "no", r.due_on ?? "", r.done, r.required, day(r.completed_at), r.certificate ?? "", r.status === "invited" ? "" : day(r.last_seen)]),
    ]);
    await store.audit(actorName(who(c)), "Exported progress", "", { rows: String(rows.length) });
    return c.body(body, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="training-progress-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  });
};
