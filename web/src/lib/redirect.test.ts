import { expect, test } from "vitest";
import { safeRedirect } from "./redirect.ts";

test.each(["/admin/users", "/admin/users?status=banned", "/"])("%s は通す", (v) => {
  expect(safeRedirect(v)).toBe(v);
});

test.each([
  "//evil.example.test",
  "https://evil.example.test",
  "/\\evil.example.test",
  "admin",
  "",
  undefined,
  1,
])("%s は / にする", (v) => {
  expect(safeRedirect(v)).toBe("/");
});
