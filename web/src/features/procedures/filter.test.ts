import type { ProcedureSummary } from "@tadori/shared";
import { expect, test } from "vitest";
import { filterProcedures, procedureCounts } from "./filter.ts";

const p = (o: Partial<ProcedureSummary>): ProcedureSummary => ({
  id: o.title ?? "x",
  title: "x",
  summary: "",
  tags: [],
  status: "published",
  latestVersionNo: 1,
  lastPublishedAt: "2026-11-01T00:00:00.000Z",
  ...o,
});

const list = [
  p({
    title: "nginx の設定変更",
    tags: ["nginx", "web"],
    lastPublishedAt: "2026-11-03T00:00:00.000Z",
  }),
  p({
    title: "証明書の更新",
    tags: ["web"],
    status: "editing",
    lastPublishedAt: "2026-11-05T00:00:00.000Z",
  }),
  p({ title: "書きかけ", status: "unpublished", latestVersionNo: null, lastPublishedAt: null }),
  p({ title: "古い手順", status: "archived", lastPublishedAt: "2026-10-01T00:00:00.000Z" }),
];
const titles = (xs: ProcedureSummary[]) => xs.map((x) => x.title);
const base = { q: "", tags: [], status: "all", sort: "published" } as const;

test("all はアーカイブを除き、最終公開日時の新しい順、未公開は最後", () => {
  expect(titles(filterProcedures(list, base))).toEqual([
    "証明書の更新",
    "nginx の設定変更",
    "書きかけ",
  ]);
});

test("q は前後の空白を除き、大文字小文字を無視した部分一致", () => {
  expect(titles(filterProcedures(list, { ...base, q: "  NGINX " }))).toEqual(["nginx の設定変更"]);
});

test("tags は全部を含むもの", () => {
  expect(titles(filterProcedures(list, { ...base, tags: ["web", "nginx"] }))).toEqual([
    "nginx の設定変更",
  ]);
  expect(titles(filterProcedures(list, { ...base, tags: ["web"] }))).toEqual([
    "証明書の更新",
    "nginx の設定変更",
  ]);
});

test("状態で絞り込む", () => {
  expect(titles(filterProcedures(list, { ...base, status: "editing" }))).toEqual(["証明書の更新"]);
  expect(titles(filterProcedures(list, { ...base, status: "unpublished" }))).toEqual(["書きかけ"]);
  expect(titles(filterProcedures(list, { ...base, status: "archived" }))).toEqual(["古い手順"]);
});

test("タイトル順", () => {
  expect(titles(filterProcedures(list, { ...base, sort: "title" }))).toEqual(
    [...titles(filterProcedures(list, base))].sort((a, b) => a.localeCompare(b, "ja")),
  );
});

test("件数のカード", () => {
  expect(procedureCounts(list)).toEqual({ all: 3, editing: 1, unpublished: 1, archived: 1 });
});
