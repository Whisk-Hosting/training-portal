import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { createHmac } from "node:crypto";
import { courseProgress, courseworkState, csv, dueState, earliest, fileProblems, grade, isDay, isPublicUrl, keyFrom, mailOn, mayTake, moved, neighbors, outline, parseInvites, questionProblems, reminderDue, slugify, uniqueSlug, webhookSignature, type Lesson, type Module, type Question } from "../src/model.ts";

const mod = (id: number, position: number): Module => ({ id, course_id: 1, position, title: `M${id}`, summary: "" });
const les = (id: number, module_id: number, position: number, extra: Partial<Lesson> = {}): Lesson => ({
  id, module_id, position, slug: `l${id}`, title: `L${id}`, kind: "read", depth: 0, optional: false, minutes: 5, body: "", video_upload_id: null, pass_mark: 80, ...extra,
});

const o = outline([mod(2, 1), mod(1, 0)], [les(3, 1, 1), les(1, 1, 0), les(4, 2, 0, { optional: true }), les(5, 2, 1)]);

test("outline orders modules and lessons by position and numbers modules", () => {
  assert.deepEqual(o.map((m) => [m.id, m.number, m.lessons.map((l) => l.id)]), [[1, 1, [1, 3]], [2, 2, [4, 5]]]);
});

test("neighbors walk across modules", () => {
  for (const [id, prev, next] of [[1, undefined, 3], [3, 1, 4], [5, 4, undefined]] as const) {
    const n = neighbors(o, id);
    assert.equal(n.prev?.id, prev, `prev of ${id}`);
    assert.equal(n.next?.id, next, `next of ${id}`);
  }
});

test("courseProgress counts required lessons and picks the next one", () => {
  const cases: [number[], { done: number; percent: number; complete: boolean; next?: number }][] = [
    [[], { done: 0, percent: 0, complete: false, next: 1 }],
    [[1, 4], { done: 1, percent: 33, complete: false, next: 3 }],
    [[1, 3, 5], { done: 3, percent: 100, complete: true, next: 4 }],
    [[1, 3, 4, 5], { done: 3, percent: 100, complete: true, next: undefined }],
  ];
  for (const [done, want] of cases) {
    const p = courseProgress(o, new Set(done));
    assert.deepEqual({ done: p.done, percent: p.percent, complete: p.complete, next: p.next?.id }, want, `done ${done}`);
  }
  assert.equal(courseProgress([], new Set()).complete, false, "an empty course is never complete");
});

const q = (id: number, correct: number): Question => ({
  id, lesson_id: 1, position: id, prompt: "?", explanation: "",
  choices: [0, 1, 2].map((i) => ({ text: String(i), correct: i === correct })),
});

test("grade scores answers against the pass mark", () => {
  const qs = [q(1, 0), q(2, 1), q(3, 2), q(4, 0), q(5, 1)];
  const cases: [Record<number, number | undefined>, number, number, boolean][] = [
    [{ 1: 0, 2: 1, 3: 2, 4: 0, 5: 1 }, 80, 5, true],
    [{ 1: 0, 2: 1, 3: 2, 4: 0, 5: 0 }, 80, 4, true],
    [{ 1: 0, 2: 1, 3: 2, 4: 1, 5: 0 }, 80, 3, false],
    [{ 1: 0 }, 20, 1, true],
    [{}, 80, 0, false],
  ];
  for (const [answers, mark, score, passed] of cases) {
    const g = grade(qs, answers, mark);
    assert.equal(g.score, score);
    assert.equal(g.passed, passed);
  }
  assert.equal(grade([], {}, 80).passed, true, "a quiz without questions passes");
});

test("questionProblems", () => {
  assert.deepEqual(questionProblems("Q", [{ text: "a", correct: true }, { text: "b", correct: false }]), []);
  assert.equal(questionProblems("", [{ text: "a", correct: true }]).length, 2);
  assert.deepEqual(questionProblems("Q", [{ text: "a", correct: true }, { text: "b", correct: true }]), ["Mark exactly one answer as correct."]);
});

test("slugify and uniqueSlug", () => {
  for (const [input, want] of [["Ordering online with us", "ordering-online-with-us"], ["  Café & Crème!  ", "cafe-creme"], ["???", "item"]]) assert.equal(slugify(input), want);
  assert.equal(uniqueSlug("intro", new Set(["intro", "intro-2"])), "intro-3");
  assert.equal(uniqueSlug("intro", new Set()), "intro");
});

test("moved swaps neighbors and stops at the ends", () => {
  assert.deepEqual(moved([1, 2, 3], 2, "up"), [2, 1, 3]);
  assert.deepEqual(moved([1, 2, 3], 2, "down"), [1, 3, 2]);
  assert.deepEqual(moved([1, 2, 3], 1, "up"), [1, 2, 3]);
  assert.deepEqual(moved([1, 2, 3], 3, "down"), [1, 2, 3]);
  assert.deepEqual(moved([1, 2, 3], 9, "up"), [1, 2, 3]);
});

describe("access", () => {
  const open = { id: 1, access: "open" as const, published: true };
  const invite = { id: 2, access: "enrolled" as const, published: true };
  const base = { editor: false, status: "active" as const, enrolled: new Map<number, Date | null>() };
  it("lets every learner take an open course and only enrolled people take an invite-only one", () => {
    assert.equal(mayTake(open, base), true);
    assert.equal(mayTake(invite, base), false);
    assert.equal(mayTake(invite, { ...base, enrolled: new Map([[2, null]]) }), true);
  });
  it("shuts out removed learners and drafts, but never editors", () => {
    assert.equal(mayTake(open, { ...base, status: "removed" }), false);
    assert.equal(mayTake({ ...open, published: false }, base), false);
    assert.equal(mayTake({ ...invite, published: false }, { ...base, editor: true, status: "removed" }), true);
  });
});

describe("dueState and earliest", () => {
  const today = new Date("2026-10-05T10:00:00Z");
  const table: [string | null, boolean, string][] = [
    [null, false, "none"],
    ["2026-10-04", false, "overdue"],
    ["2026-10-05", false, "soon"],
    ["2026-10-12", false, "soon"],
    ["2026-10-13", false, "later"],
    ["2026-10-01", true, "done"],
  ];
  for (const [due, complete, want] of table)
    it(`${due ?? "no date"}${complete ? " (complete)" : ""} is ${want}`, () => assert.equal(dueState(due ? new Date(`${due}T00:00:00Z`) : null, complete, today), want));
  it("keeps the sooner date", () => {
    const a = new Date("2026-01-01"), b = new Date("2026-02-01");
    assert.equal(earliest(a, b), a);
    assert.equal(earliest(null, b), b);
    assert.equal(earliest(a, undefined), a);
    assert.equal(earliest(null, null), null);
  });
});

describe("parseInvites", () => {
  it("reads emails, names and groups, from commas or tabs, skipping a header", () => {
    const { rows, problems } = parseInvites("Email,Name,Group\nAna@Example.com, Ana Silva, Retail\nben@example.com\tBen Ng\n\ncara@example.com");
    assert.deepEqual(rows, [
      { email: "ana@example.com", name: "Ana Silva", group: "Retail" },
      { email: "ben@example.com", name: "Ben Ng", group: "" },
      { email: "cara@example.com", name: "", group: "" },
    ]);
    assert.deepEqual(problems, []);
  });
  it("reports bad lines and repeats with their line numbers", () => {
    const { rows, problems } = parseInvites("ana@example.com\nnot an email\nANA@example.com");
    assert.equal(rows.length, 1);
    assert.deepEqual(problems.map((p) => [p.line, p.why]), [
      [2, "Not an email address."],
      [3, "Already on an earlier line."],
    ]);
  });
});

describe("reminderDue", () => {
  const now = new Date("2026-10-05T09:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it("nudges people away a week who were not nudged in the last week", () => {
    assert.equal(reminderDue(daysAgo(8), null, now), true);
    assert.equal(reminderDue(null, null, now), true);
    assert.equal(reminderDue(daysAgo(3), null, now), false);
    assert.equal(reminderDue(daysAgo(8), daysAgo(2), now), false);
    assert.equal(reminderDue(daysAgo(8), daysAgo(7), now), true);
  });
});

describe("csv", () => {
  it("quotes what needs it and defuses spreadsheet formulas", () => {
    assert.equal(csv([["a", 'say "hi"', "x,y"], ["=SUM(A1)", null, 3]]), 'a,"say ""hi""","x,y"\r\n\'=SUM(A1),,3\r\n');
  });
});

describe("isPublicUrl", () => {
  for (const [u, ok] of [
    ["https://hooks.example.com/x", true],
    ["http://hooks.example.com/x", false],
    ["https://localhost/x", false],
    ["https://10.0.0.5/x", false],
    ["https://192.168.1.1/", false],
    ["https://[::1]/", false],
    ["https://intranet/", false],
    ["not a url", false],
  ] as const)
    it(`${u} is ${ok ? "allowed" : "refused"}`, () => assert.equal(isPublicUrl(u), ok));
});

describe("webhookSignature", () => {
  it("signs t.body with HMAC-SHA256", () => {
    // Known answer: printf '1700000000.{"a":1}' | openssl dgst -sha256 -hmac whsec_test
    assert.equal(webhookSignature("whsec_test", 1700000000, '{"a":1}'), `t=1700000000,v1=${createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex")}`);
  });
});

describe("mailOn", () => {
  it("sends through Whisk email unless turned off", () => {
    assert.equal(mailOn({ mail_mode: "whisk" }), true);
    assert.equal(mailOn({ mail_mode: "off" }), false);
  });
});

describe("coursework", () => {
  it("allows handing in with nothing yet or after a redo, not while waiting or passed", () => {
    assert.deepEqual(courseworkState([]), { state: "none", canSubmit: true });
    assert.deepEqual(courseworkState([{ status: "redo" }, { status: "submitted" }]), { state: "redo", canSubmit: true });
    assert.equal(courseworkState([{ status: "submitted" }]).canSubmit, false);
    assert.equal(courseworkState([{ status: "passed" }]).canSubmit, false);
  });
  it("checks file count and size", () => {
    assert.deepEqual(fileProblems([]), ["Add at least one file."]);
    assert.deepEqual(fileProblems([{ size: 10 }]), []);
    assert.deepEqual(fileProblems(Array(11).fill({ size: 10 })), ["Hand in at most 10 files."]);
    assert.deepEqual(fileProblems([{ size: 300 * 1024 ** 2 }]), ["Each file must be smaller than 200 MB."]);
  });
  it("accepts only real calendar days as due dates", () => {
    assert.equal(isDay("2026-02-28"), true);
    assert.equal(isDay("2026-02-30"), false);
    assert.equal(isDay("28/02/2026"), false);
  });
});

test("keyFrom reads a key as Bearer, Basic user name, X-Api-Key or ?token=", () => {
  const b64 = (s: string) => Buffer.from(s).toString("base64");
  const cases: [string, Record<string, string>, string | undefined, string][] = [
    ["bearer", { authorization: "Bearer trn_abc" }, undefined, "trn_abc"],
    ["bearer, any case, spaces", { authorization: "  bearer   trn_abc " }, undefined, "trn_abc"],
    ["basic with the key as user name", { authorization: `Basic ${b64("trn_abc:")}` }, undefined, "trn_abc"],
    ["basic without a colon", { authorization: `basic ${b64("trn_abc")}` }, undefined, "trn_abc"],
    ["x-api-key", { "x-api-key": "trn_abc" }, undefined, "trn_abc"],
    ["?token=", {}, "trn_abc", "trn_abc"],
    ["bearer wins over the rest", { authorization: "Bearer trn_one", "x-api-key": "trn_two" }, "trn_three", "trn_one"],
    ["x-api-key wins over ?token=", { "x-api-key": "trn_two" }, "trn_three", "trn_two"],
    ["another scheme falls through", { authorization: "Token trn_one", "x-api-key": "trn_two" }, undefined, "trn_two"],
    ["nothing", {}, undefined, ""],
  ];
  for (const [name, headers, token, want] of cases) assert.equal(keyFrom((n) => headers[n], token), want, name);
});
