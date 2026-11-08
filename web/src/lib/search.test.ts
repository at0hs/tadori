import { expect, test } from "vitest";
import { z } from "zod";
import { idSearchParam, listSearchParam, stringListSearchParam } from "./search.ts";

test("ID はそのまま", () => {
  const id = "01970000-0000-7000-8000-0000000000a1";
  expect(idSearchParam.parse(id)).toBe(id);
});

// ?executor=123 は検索条件の読み取りで数になる。捨てると絞り込みが外れて全件が出るので、文字列に戻す
test("数は文字列にする", () => {
  expect(idSearchParam.parse(123)).toBe("123");
});

test.each([undefined, null, true, { a: 1 }, ["x"]])("%s は指定なし", (v) => {
  expect(idSearchParam.parse(v)).toBeUndefined();
});

test("1つだけの値は1件の配列にする", () => {
  const status = listSearchParam(z.enum(["running", "completed"]));
  expect(status.parse("running")).toEqual(["running"]);
  expect(status.parse(["running", "completed"])).toEqual(["running", "completed"]);
  expect(status.parse(undefined)).toEqual([]);
  expect(status.parse("bogus")).toEqual([]);
});

test("文字列の配列は、数として読まれた値を文字列に戻す", () => {
  expect(stringListSearchParam.parse(2026)).toEqual(["2026"]);
  expect(stringListSearchParam.parse(["db", 2026])).toEqual(["db", "2026"]);
});
