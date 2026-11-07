import { expect, test } from "vitest";
import { formatDateTime, formatShortDateTime } from "./format.ts";

test("日本時間で表示する", () => {
  expect(formatDateTime("2026-11-05T07:40:00.000Z")).toBe("2026/11/05 16:40");
  expect(formatShortDateTime("2026-11-05T07:40:00.000Z")).toBe("11/05 16:40");
  // 日付をまたぐ
  expect(formatDateTime("2026-12-31T15:05:00.000Z")).toBe("2027/01/01 00:05");
});
