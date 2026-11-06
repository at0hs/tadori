import { afterEach, expect, test } from "vitest";
import { applyTheme, readThemePreference, resolveTheme } from "./theme.ts";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

test("保存がなければ OS に合わせる", () => {
  expect(readThemePreference({ getItem: () => null })).toBe("system");
});

test("知らない値は OS に合わせる", () => {
  expect(readThemePreference({ getItem: () => "blue" })).toBe("system");
});

test("保存した値を読む", () => {
  expect(readThemePreference({ getItem: () => "dark" })).toBe("dark");
});

test.each([
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["system", true, "dark"],
  ["system", false, "light"],
] as const)("%s（OS がダーク=%s）は %s", (pref, prefersDark, want) => {
  expect(resolveTheme(pref, prefersDark)).toBe(want);
});

test("applyTheme は保存して html に dark を付け外しする", () => {
  applyTheme("dark");
  expect(localStorage.getItem("tadori.theme")).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  applyTheme("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
