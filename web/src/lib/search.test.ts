import { expect, test } from "vitest";
import { idSearchParam } from "./search.ts";

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
