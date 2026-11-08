import { expect, test } from "vitest";
import { safeRedirect } from "./redirect.ts";

test.each(["/admin/users", "/admin/users?status=banned", "/", "/executions#step-1"])(
  "%s は通す",
  (v) => {
    expect(safeRedirect(v)).toBe(v);
  },
);

test.each([
  "//evil.example.test",
  "https://evil.example.test",
  "/\\evil.example.test",
  // URL の解釈ではタブ・改行が取り除かれ、//evil… になる
  "/\t/evil.example.test",
  "/\n/evil.example.test",
  "/\r\n/evil.example.test",
  "\\\\evil.example.test",
  // 正規化すると //evil… になる
  "/.//evil.example.test",
  "/a/..//evil.example.test",
  "admin",
  "",
  undefined,
  1,
])("%s は / にする", (v) => {
  expect(safeRedirect(v)).toBe("/");
});
