import { serve as nodeServe } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { api } from "./api.js";
import { sql } from "./db.js";
import { demo } from "./demo.js";
import { functions } from "./functions.js";
import { courseRoutes } from "./routes/courses.js";
import { learnRoutes } from "./routes/learn.js";
import { peopleRoutes } from "./routes/people.js";
import { settingsRoutes } from "./routes/settings.js";
import { js } from "./views/scripts.js";
import { css } from "./views/styles.js";
import { message } from "./views/pages.js";
import { notFound, render, who } from "./web.js";
import { canEdit, devStub, env, inngest, log } from "./whisk.js";

if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.WHISK_ENV });
}

const app = new Hono();

// Every request: one JSON log line with the request id.
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  const id = who(c);
  log.info({ request_id: id.requestId, method: c.req.method, path: c.req.path, status: c.res.status, audience: id.audience, ms: Date.now() - started }, "request");
});

app.get("/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 503);
  }
});

app.get("/assets/app.css", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(css, 200, { "content-type": "text/css; charset=utf-8" });
});
app.get("/assets/app.js", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(js, 200, { "content-type": "text/javascript; charset=utf-8" });
});

// Fonts ship with the app (OFL), so pages make no requests to anyone else.
const fontFiles = Object.fromEntries(
  await Promise.all(
    [
      ["figtree-latin-wght-normal.woff2", "@fontsource-variable/figtree"],
      ["figtree-latin-ext-wght-normal.woff2", "@fontsource-variable/figtree"],
      ["figtree-latin-wght-italic.woff2", "@fontsource-variable/figtree"],
      ["jetbrains-mono-latin-400-normal.woff2", "@fontsource/jetbrains-mono"],
      ["jetbrains-mono-latin-600-normal.woff2", "@fontsource/jetbrains-mono"],
    ].map(async ([file, pkg]) => [file, await readFile(new URL(`../node_modules/${pkg}/files/${file}`, import.meta.url))] as const),
  ),
);
app.get("/assets/fonts/:file", (c) => {
  const font = fontFiles[c.req.param("file")];
  if (!font) return c.notFound();
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(new Uint8Array(font), 200, { "content-type": "font/woff2" });
});

// Demo mode, on only with DEMO=1 (src/demo.ts): its routes go ahead of the app's.
const demoFunctions = demo(app);

// Function runs arrive here from the platform with the service identity (queue.endpoint).
const inngestHandler = inngestServe({ client: inngest, functions: [...functions, ...demoFunctions] });
app.on(["GET", "POST", "PUT"], "/.whisk/inngest", (c) => inngestHandler(c));

// The API answers JSON and checks its own keys.
app.route("/api/v1", api);

// On a laptop without Whisk, uploads land here (see devApi in whisk.ts).
if (devStub()) {
  const dir = "/tmp/training-dev-storage";
  await mkdir(dir, { recursive: true });
  app.post("/.dev/storage/:id", async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) return c.text("no file", 400);
    await writeFile(`${dir}/${c.req.param("id").replace(/[^A-Za-z0-9_-]/g, "")}`, new Uint8Array(await file.arrayBuffer()));
    return c.body(null, 204);
  });
  app.get("/.dev/storage/:id", async (c) => {
    const data = await readFile(`${dir}/${c.req.param("id").replace(/[^A-Za-z0-9_-]/g, "")}`).catch(() => undefined);
    return data ? c.body(new Uint8Array(data), 200, { "content-type": "application/octet-stream" }) : c.notFound();
  });
}

learnRoutes(app);

// Staff: the team's owners, admins and developers, and the trainers and training-admins groups.
const editorsOnly = async (c: Context, next: () => Promise<void>) => {
  if (!canEdit(who(c)))
    return render(c, "Not allowed", message("This part is for trainers", "Ask an owner of this business to add you to its trainers group."), { status: 403 });
  await next();
};
app.use("/edit", editorsOnly);
app.use("/edit/*", editorsOnly);
courseRoutes(app);
peopleRoutes(app);
settingsRoutes(app);

app.notFound((c) =>
  c.req.path.startsWith("/api/") ? c.json({ error: { code: "NOT_FOUND", message: "There is no such API endpoint.", fix: "GET /api/v1 lists the endpoints." } }, 404) : notFound(c),
);

app.onError(async (err, c) => {
  log.error({ request_id: who(c).requestId, err: err.message, stack: err.stack }, "unhandled error");
  if (process.env.SENTRY_DSN) (await import("@sentry/node")).captureException(err);
  const ref = who(c).requestId.replace(/[^A-Za-z0-9_-]/g, "") || "none";
  if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "INTERNAL", message: "Something went wrong.", fix: `Try again. If it keeps happening, quote ${ref}.` } }, 500);
  return c.html(
    `<!doctype html><title>Something went wrong</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Something went wrong</h1><p>Try again in a moment. If it keeps happening, quote this reference: ${ref}.</p><p><a href="/">Back to the courses</a></p></body>`,
    500,
  );
});

const server = nodeServe({ fetch: app.fetch, port: Number(env("PORT", "8080")), hostname: "0.0.0.0" }, (info) => log.info({ port: info.port }, "listening"));

// SIGTERM: stop accepting, finish in-flight requests, close the pool, exit within the grace period.
const shutdown = () => {
  log.info("shutting down");
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), (Number(process.env.WHISK_STOP_GRACE ?? 28) - 2) * 1000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
