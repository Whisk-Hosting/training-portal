// The portal's emails: short, plain, one button. Each returns subject, HTML and text.
import { html, raw } from "hono/html";
import { isColor } from "./model.js";
import type { Mail } from "./mail.js";
import type { Settings } from "./store.js";

type Body = { to: string; subject: string; greeting: string; lines: string[]; button?: { href: string; label: string }; after?: string[] };

const fmtDay = (d: string | Date) => new Date(typeof d === "string" ? `${d}T00:00:00Z` : d).toLocaleDateString("en-US", { day: "numeric", month: "long", timeZone: "UTC" });

const compose = async (s: Settings, b: Body): Promise<Mail> => {
  const accent = isColor(s.accent) ? s.accent : "#e85d2a";
  const page = await html`<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e7e2d6">
<tr><td style="padding:28px 28px 8px;font-weight:700;font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${raw(accent)};margin-right:8px"></span>${s.portal_name}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.55">
<p style="margin:0 0 14px">${b.greeting}</p>
${b.lines.map((l) => html`<p style="margin:0 0 14px">${l}</p>`)}
${b.button ? html`<p style="margin:22px 0"><a href="${b.button.href}" style="display:inline-block;background:${raw(accent)};color:#fff;text-decoration:none;font-weight:650;padding:12px 20px;border-radius:8px">${b.button.label}</a></p>` : ""}
${(b.after ?? []).map((l) => html`<p style="margin:0 0 14px;color:#6b665b;font-size:14px">${l}</p>`)}
</td></tr></table></td></tr></table></body></html>`;
  const text = [b.greeting, "", ...b.lines.flatMap((l) => [l, ""]), ...(b.button ? [`${b.button.label}: ${b.button.href}`, ""] : []), ...(b.after ?? [])].join("\n").trim() + "\n";
  return { to: b.to, subject: b.subject, html: page.toString(), text };
};

const hi = (name: string) => (name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,");
const courseList = (cs: { title: string; due_on?: string | null }[]) =>
  cs.map((c) => (c.due_on ? `${c.title} (by ${fmtDay(c.due_on)})` : c.title)).join(", ");

export const inviteEmail = (s: Settings, p: { to: string; name: string; link: string; courses: { title: string; due_on?: string | null }[] }) =>
  compose(s, {
    to: p.to,
    subject: `You're invited to ${s.portal_name}`,
    greeting: hi(p.name),
    lines: [
      p.courses.length ? `You've been given access to ${s.portal_name} for ${courseList(p.courses)}.` : `You've been given access to ${s.portal_name}.`,
      "Use the button to sign in. You'll get a code by email each time; there's no password to remember.",
    ],
    button: { href: p.link, label: "Open your training" },
  });

export const enrolledEmail = (s: Settings, p: { to: string; name: string; link: string; course: string; due_on: string | null }) =>
  compose(s, {
    to: p.to,
    subject: `New course: ${p.course}`,
    greeting: hi(p.name),
    lines: [`You've been added to ${p.course}${p.due_on ? `. Please finish it by ${fmtDay(p.due_on)}` : ""}.`],
    button: { href: p.link, label: "Start the course" },
  });

export const reminderEmail = (s: Settings, p: { to: string; name: string; link: string; courses: { title: string; due_on: string | null; done: number; required: number }[] }) =>
  compose(s, {
    to: p.to,
    subject: `Your training: ${p.courses.length === 1 ? p.courses[0].title : `${p.courses.length} courses to finish`}`,
    greeting: hi(p.name),
    lines: [
      "A quick reminder about your training:",
      ...p.courses.map((c) => `${c.title}: ${c.done} of ${c.required} lessons done${c.due_on ? `, due ${fmtDay(c.due_on)}` : ""}.`),
    ],
    button: { href: p.link, label: "Carry on" },
    after: ["You'll get at most one of these a week."],
  });

export const certificateEmail = (s: Settings, p: { to: string; name: string; course: string; link: string }) =>
  compose(s, {
    to: p.to,
    subject: `You finished ${p.course}`,
    greeting: hi(p.name),
    lines: [`Well done. You finished ${p.course} and your certificate is ready.`, "Anyone you share the link with can check it is genuine."],
    button: { href: p.link, label: "View your certificate" },
    after: [`PDF copy: ${p.link}/pdf`],
  });

export const markedEmail = (s: Settings, p: { to: string; name: string; lesson: string; course: string; passed: boolean; feedback: string; link: string }) =>
  compose(s, {
    to: p.to,
    subject: p.passed ? `Passed: ${p.lesson}` : `Try again: ${p.lesson}`,
    greeting: hi(p.name),
    lines: [
      p.passed ? `Your work for ${p.lesson} in ${p.course} has been marked as passed.` : `Your work for ${p.lesson} in ${p.course} needs another try.`,
      ...(p.feedback ? [`Feedback: ${p.feedback}`] : []),
    ],
    button: { href: p.link, label: p.passed ? "Carry on" : "See the feedback" },
  });

export const submittedEmail = (s: Settings, p: { to: string; learner: string; lesson: string; course: string; link: string }) =>
  compose(s, {
    to: p.to,
    subject: `To mark: ${p.learner}, ${p.lesson}`,
    greeting: "Hi,",
    lines: [`${p.learner} handed in work for ${p.lesson} in ${p.course}.`],
    button: { href: p.link, label: "Mark it" },
  });

export const testEmail = (s: Settings, to: string) =>
  compose(s, { to, subject: `Test email from ${s.portal_name}`, greeting: "Hi,", lines: ["Email from your training portal works."] });
