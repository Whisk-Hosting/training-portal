import assert from "node:assert/strict";
import { test } from "node:test";
import { markdown } from "../src/markdown.ts";

test("raw HTML in a lesson is shown as text", () => {
  const out = markdown('Hello <script>alert(1)</script> <img src=x onerror="alert(1)">');
  assert.ok(!out.includes("<script>"), out);
  assert.ok(!out.includes("<img src=x"), out);
});

test("links only go to safe places", () => {
  assert.ok(markdown("[x](javascript:alert(1))").includes('href="#"'));
  assert.ok(markdown("[x](https://example.com)").includes('href="https://example.com" rel="noopener" target="_blank"'));
  assert.ok(markdown("[x](/courses/a)").includes('href="/courses/a"'));
});

test("formatting still works", () => {
  const out = markdown("## Hi\n\n**bold** and a list:\n\n- one\n- two\n\n> tip");
  for (const want of ["<h2>Hi</h2>", "<strong>bold</strong>", "<li>one</li>", "<blockquote>"]) assert.ok(out.includes(want), want);
});
