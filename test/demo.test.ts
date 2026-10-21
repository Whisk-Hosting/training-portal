import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";

// The modules below open a database pool lazily; nothing here runs a query.
process.env.DATABASE_URL ??= "postgres://nobody@127.0.0.1:1/none";
const { asGuest, cookieValue, demo, demoMode, demoOn, guestId, leaveCookie, refusal, startCookie, tablesToEmpty } = await import("../src/demo.ts");
const { canAdmin, canEdit, currentMode, identity, plainMode, setMode } = await import("../src/whisk.ts");
type Identity = ReturnType<typeof identity>;

const anon: Identity = { audience: "anonymous", groups: [], roles: [], requestId: "r1" };
const team: Identity = { audience: "team", userId: "u_team", email: "sam@example.com", name: "Sam", groups: [], roles: ["owner"], requestId: "r2" };
const customer: Identity = { audience: "customer", userId: "c_1", email: "kim@example.com", groups: [], roles: [], requestId: "r3" };

test("demo mode is off unless DEMO is exactly 1", () => {
  for (const [env, want] of [
    [{}, false],
    [{ DEMO: "" }, false],
    [{ DEMO: "0" }, false],
    [{ DEMO: "true" }, false],
    [{ DEMO: "yes" }, false],
    [{ DEMO: " 1" }, false],
    [{ DEMO: "1" }, true],
  ] as const)
    assert.equal(demoOn(env), want, JSON.stringify(env));
});

test("cookieValue reads one cookie from a Cookie header", () => {
  for (const [header, want] of [
    [undefined, undefined],
    ["", undefined],
    ["guest=1", "1"],
    ["a=b; guest=1; c=d", "1"],
    ["a=b;guest=1", "1"],
    [" guest = 1 ", "1"],
    ["guest=", ""],
    ["guest", undefined],
    ["xguest=1", undefined],
    ["guest2=1", undefined],
    ["__Host-guest=1", undefined],
    ["other=guest=1", undefined],
    ["guest=1; guest=0", "1"],
  ] as const)
    assert.equal(cookieValue(header, "guest"), want, String(header));
});

test("asGuest makes only an anonymous request with the guest cookie the guest", () => {
  const cases: [string, Identity, string | undefined, string][] = [
    ["anonymous with the cookie", anon, "guest=1", "guest"],
    ["anonymous with other cookies too", anon, "theme=dark; guest=1", "guest"],
    ["anonymous without it", anon, undefined, "anonymous"],
    ["anonymous with another value", anon, "guest=yes", "anonymous"],
    ["anonymous with an emptied cookie", anon, "guest=", "anonymous"],
    ["a team member with the cookie", team, "guest=1", "team member"],
    ["a customer with the cookie", customer, "guest=1", "customer"],
  ];
  for (const [name, id, cookies, want] of cases) {
    const got = asGuest(id, cookies);
    const who = got.guest ? "guest" : got === team ? "team member" : got === customer ? "customer" : got.audience;
    assert.equal(who, want, name);
  }
});

test("the guest is a team member who may edit and run the portal", () => {
  const g = asGuest(anon, "guest=1");
  assert.deepEqual(
    { audience: g.audience, userId: g.userId, email: g.email, name: g.name, roles: g.roles, requestId: g.requestId, guest: g.guest },
    { audience: "team", userId: guestId, email: "guest@example.com", name: "Guest", roles: ["member"], requestId: "r1", guest: true },
  );
  assert.equal(canEdit(g), true);
  assert.equal(canAdmin(g), true);
});

test("refusal stops calls that make customers, uploads or emails, and nothing else", () => {
  for (const [method, path, want] of [
    ["POST", "/customers", "DEMO_INVITES_OFF"],
    ["POST", "/uploads", "DEMO_UPLOADS_OFF"],
    ["POST", "/email/send", "DEMO_EMAIL_HELD"],
    ["GET", "/uploads/up123", undefined],
    ["GET", "/customers", undefined],
    ["POST", "/events", undefined],
  ] as const) {
    const r = refusal(method, path);
    assert.equal(r?.code, want, `${method} ${path}`);
    if (r) assert.ok(r.message.endsWith(".") && r.fix.length > 10, "every refusal has a sentence and a fix");
  }
});

test("the guest cookie is HttpOnly, Secure, SameSite=Lax and site-wide; leaving clears it", () => {
  assert.equal(startCookie, "guest=1; HttpOnly; Secure; SameSite=Lax; Path=/");
  assert.match(leaveCookie, /^guest=; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=0$/);
});

test("tablesToEmpty keeps only the migrations record", () => {
  assert.deepEqual(tablesToEmpty(["courses", "schema_migrations", "settings", "learners"]), ["courses", "settings", "learners"]);
  assert.deepEqual(tablesToEmpty([]), []);
});

// The tests below change the app's mode, so they run last and in order.

test("off by default: the cookie is ignored and the demo routes answer 404", async () => {
  assert.equal(currentMode(), plainMode);
  const headers: Record<string, string> = { cookie: "guest=1" };
  assert.equal(identity((n) => headers[n]).audience, "anonymous");
  const app = new Hono();
  assert.deepEqual(demo(app, {}), []);
  assert.equal(currentMode(), plainMode);
  for (const [method, path] of [["POST", "/demo/start"], ["GET", "/demo/leave"]]) assert.equal((await app.request(path, { method })).status, 404, path);
});

test("with DEMO=1 the cookie makes the guest, a real sign-in wins, and Look around sets the cookie", async () => {
  const app = new Hono();
  const fns = demo(app, { DEMO: "1" });
  try {
    assert.equal(fns.length, 1, "demo-reset is served");
    assert.equal(currentMode(), demoMode);
    const anonHeaders: Record<string, string> = { cookie: "guest=1" };
    assert.equal(identity((n) => anonHeaders[n]).userId, guestId);
    const teamHeaders: Record<string, string> = { cookie: "guest=1", "x-whisk-audience": "team", "x-whisk-user-id": "u_team", "x-whisk-roles": "owner" };
    assert.equal(identity((n) => teamHeaders[n]).userId, "u_team");
    const start = await app.request("/demo/start", { method: "POST" });
    assert.equal(start.status, 303);
    assert.equal(start.headers.get("location"), "/edit");
    assert.equal(start.headers.get("set-cookie"), startCookie);
    const leave = await app.request("/demo/leave");
    assert.equal(leave.headers.get("location"), "/");
    assert.equal(leave.headers.get("set-cookie"), leaveCookie);
    const upload = await app.request("/learn/getting-started/plan-a-lesson/upload", { method: "POST" });
    assert.equal(upload.status, 403);
    assert.equal(((await upload.json()) as { code: string }).code, "DEMO_UPLOADS_OFF");
    // The API is the app's own, behind its key: the demo adds no route there. Inviting through
    // it is refused by refusal("POST", "/customers") once a key is checked.
    const invite = await app.request("/api/v1/learners", { method: "POST" });
    assert.equal(invite.status, 404);
    assert.equal(currentMode().refuse("POST", "/customers")?.code, "DEMO_INVITES_OFF");
    assert.match(currentMode().keysNote ?? "", /removed every night/);
  } finally {
    setMode(plainMode);
  }
});
