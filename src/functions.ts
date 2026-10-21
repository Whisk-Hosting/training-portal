// The portal's background functions. Step names match workflows/*.graph.yaml.
import { reminderEmail } from "./emails.js";
import { baseUrl, deliverWebhookNow, sendEmailNow, email } from "./events.js";
import { mailIsOn } from "./mail.js";
import { reminderDue } from "./model.js";
import * as store from "./store.js";
import { inngest } from "./whisk.js";

type Failure = { event: { data: { event: { data: Record<string, unknown> } } }; error: Error };

export const sendEmail = inngest.createFunction(
  {
    id: "send-email",
    triggers: [{ event: "email.send" }],
    retries: 4,
    throttle: { limit: 60, period: "1m" },
    onFailure: async ({ event, error }: Failure) => {
      await store.markEmail(Number(event.data.event.data.email_id), "failed", error.message);
    },
  },
  async ({ event, step }) => step.run("send", () => sendEmailNow(Number(event.data.email_id), false)),
);

export const deliverWebhook = inngest.createFunction(
  {
    id: "deliver-webhook",
    triggers: [{ event: "webhook.deliver" }],
    retries: 8,
    concurrency: { limit: 5 },
    onFailure: async ({ event }: Failure) => {
      await store.deliveryFailed(Number(event.data.event.data.delivery_id));
    },
  },
  async ({ event, step }) => step.run("deliver", () => deliverWebhookNow(Number(event.data.delivery_id))),
);

// Every morning, a nudge to each learner with unfinished enrolled courses who has not been
// in, or been reminded, for a week.
export const reminders = inngest.createFunction({ id: "reminders", triggers: [{ cron: "0 9 * * *" }] }, async ({ step }) => {
  const due = await step.run("find-learners", async () => {
    const s = await store.settings();
    if (!s.reminders || !mailIsOn(s)) return [];
    const now = new Date();
    return (await store.reminderCandidates())
      .filter((r) => reminderDue(r.last_seen ? new Date(r.last_seen) : null, r.reminded_at ? new Date(r.reminded_at) : null, now))
      .slice(0, 500)
      .map((r) => r.user_id);
  });
  return step.run("send-reminders", async () => {
    const s = await store.settings();
    const byId = new Map((await store.reminderCandidates()).map((r) => [r.user_id, r]));
    let sent = 0;
    for (const id of due) {
      const r = byId.get(id);
      if (!r) continue;
      await store.markReminded(id);
      await email("reminder", reminderEmail(s, { to: r.email, name: r.name, link: r.status === "invited" && r.invite_url ? r.invite_url : `${baseUrl()}/me`, courses: r.courses }));
      sent++;
    }
    return { sent };
  });
});

export const functions = [sendEmail, deliverWebhook, reminders];
