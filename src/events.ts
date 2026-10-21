// What happens after something changes: emails to people and webhook calls to other systems.
// Each is written down first (emails, deliveries) and then handed to the platform queue, so a
// slow send or a receiver that is down never holds up a page, and failures retry.
// Where no queue runs (a preview, a plain local run) the work runs once in the background.
import { randomUUID } from "node:crypto";
import { deliver, mailIsOn, type Mail } from "./mail.js";
import { webhookSignature, type WebhookEvent } from "./model.js";
import * as store from "./store.js";
import { currentMode, enqueue, isPreview, log, queueAvailable } from "./whisk.js";

export const baseUrl = () => (process.env.WHISK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");

const dispatch = async (name: string, data: Record<string, unknown>, dedupe: string, run: () => Promise<void>) => {
  const inline = () => void run().catch((err) => log.warn({ err: String(err), name }, "background work failed"));
  if (!queueAvailable() || isPreview()) return inline();
  try {
    await enqueue(name, data, dedupe);
  } catch (err) {
    log.warn({ err: String(err), name }, "queue refused the event; running it now");
    inline();
  }
};

// ----- Email -----

// email records a message and sends it in the background. With email off it is recorded as
// skipped, so Settings shows what would have gone.
export const email = async (kind: string, message: Mail | Promise<Mail>) => {
  try {
    const m = await message;
    const id = await store.queueEmail({ kind, ...m });
    if (currentMode().hold) return void (await store.markEmail(id, "demo", heldEmail));
    if (!mailIsOn(await store.settings())) return void (await store.markEmail(id, "skipped", "Email is off."));
    await dispatch("email.send", { email_id: id }, `email-${id}`, async () => void (await sendEmailNow(id)));
  } catch (err) {
    log.error({ err: String(err), kind }, "could not queue an email");
  }
};

const heldEmail = "Demo: recorded, not sent.";

// sendEmailNow sends one recorded message and answers what became of it. It throws on failure
// so the queue retries; the last failure is marked by the function's failure handler.
export const sendEmailNow = async (id: number, last = true): Promise<"sent" | "skipped" | "demo" | undefined> => {
  const e = await store.emailById(id);
  if (!e || e.status !== "pending") return;
  if (currentMode().hold) {
    await store.markEmail(id, "demo", heldEmail);
    return "demo";
  }
  try {
    const result = await deliver(await store.settings(), { to: e.to_email, subject: e.subject, html: e.html, text: e.text });
    await store.markEmail(id, result, result === "skipped" ? "Email is off." : "");
    return result;
  } catch (err) {
    if (last) await store.markEmail(id, "failed", String((err as Error).message ?? err));
    throw err;
  }
};

// ----- Webhooks -----

export type Ref = Record<string, unknown>;
export const learnerRef = (l: { user_id: string; email: string; name: string; group_name?: string | null }): Ref => ({
  id: l.user_id,
  email: l.email,
  name: l.name,
  group: l.group_name ?? null,
});
export const courseRef = (c: { id: number; slug: string; title: string }): Ref => ({ id: c.id, slug: c.slug, title: c.title, url: `${baseUrl()}/courses/${c.slug}` });
export const lessonRef = (l: { id: number; slug: string; title: string; kind: string }): Ref => ({ id: l.id, slug: l.slug, title: l.title, kind: l.kind });

// emit records one delivery per webhook that listens for the event and queues each. It never
// fails the caller: a change already made stays made.
export const emit = async (event: WebhookEvent | "ping", data: Ref, only?: number) => {
  try {
    const hooks = only ? [await store.webhookById(only)].filter((h) => h !== undefined) : await store.hooksFor(event);
    if (hooks.length === 0) return;
    const payload = { id: `evt_${randomUUID()}`, type: event, created_at: new Date().toISOString(), data };
    for (const h of hooks) {
      const id = await store.recordDelivery(h.id, event, payload);
      if (currentMode().hold) {
        await store.holdDelivery(id);
        continue;
      }
      await dispatch("webhook.deliver", { delivery_id: id }, `delivery-${id}`, () => deliverWebhookNow(id));
    }
  } catch (err) {
    log.error({ err: String(err), event }, "could not queue a webhook");
  }
};

// deliverWebhookNow posts one delivery. Anything but a 2xx answer throws, so the queue retries
// with backoff; redirects are not followed.
export const deliverWebhookNow = async (id: number) => {
  const d = await store.deliveryById(id);
  if (!d || d.status !== "pending") return;
  if (currentMode().hold) return void (await store.holdDelivery(id));
  const body = JSON.stringify(d.payload);
  const t = Math.floor(Date.now() / 1000);
  let status: number | null = null;
  let error = "";
  try {
    const res = await fetch(d.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "user-agent": "training-portal-webhooks/1",
        "webhook-id": String((d.payload as { id?: string }).id ?? id),
        "webhook-event": d.event,
        "webhook-signature": webhookSignature(d.secret, t, body),
      },
      body,
    });
    status = res.status;
    if (!res.ok) error = `The receiver answered ${res.status}.`;
    await res.body?.cancel().catch(() => undefined);
  } catch (err) {
    error = (err as Error).name === "TimeoutError" ? "No answer within 10 seconds." : `Could not connect: ${(err as Error).message}`;
  }
  await store.deliveryAttempt(id, status, error);
  if (error) throw new Error(error);
};
