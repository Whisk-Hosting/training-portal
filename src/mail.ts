// Sending email through Whisk email. A message is written to the emails table first, then sent
// by the send-email function (or straight away where no queue runs), so staff can see what went
// and what failed.
import { mailOn } from "./model.js";
import type { Settings } from "./store.js";
import { whiskApi } from "./whisk.js";

export type Mail = { to: string; subject: string; html: string; text: string };

// The business's own address when set; otherwise Whisk sends from its own.
const fromHeader = (s: Settings) => (s.email_from ? `"${s.portal_name.replace(/["\\\r\n]/g, "")}" <${s.email_from}>` : undefined);

// deliver sends one message. It answers "skipped" when email is off, and throws when Whisk
// refuses the message (an unverified from domain, a limit).
export const deliver = async (s: Settings, m: Mail): Promise<"sent" | "skipped"> => {
  if (!mailOn(s)) return "skipped";
  await whiskApi("/email/send", { to: m.to, subject: m.subject, html: m.html, text: m.text, from: fromHeader(s), reply_to: s.notify_email || undefined });
  return "sent";
};

export const mailIsOn = (s: Settings) => mailOn(s);
