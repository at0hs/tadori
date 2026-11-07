import { describe, expect, it } from "vitest";
import { newId } from "../ids.ts";
import { findVariableRefs } from "./parse.ts";

const names = (text: string) => findVariableRefs(text).map((r) => r.name);

describe("F-04: #{変数名} の解析", () => {
  it("規則に合う #{name} を順に返す", () => {
    expect(names("ssh #{host} -p #{port}")).toEqual(["host", "port"]);
  });

  it("位置は #{ から } までを含む", () => {
    expect(findVariableRefs("a #{host} b")[0]).toEqual({ name: "host", start: 2, end: 9 });
  });

  it("##{name} はエスケープなので変数にしない", () => {
    expect(names("##{host}")).toEqual([]);
    expect(names("###{host}")).toEqual([]);
  });

  it("規則に合わない #{...} はそのままの文字列", () => {
    expect(names("#{1abc} #{a b} #{} #{日本} #{_a}")).toEqual([]);
  });

  it("名前は 64 文字まで", () => {
    expect(names(`#{${"a".repeat(64)}}`)).toHaveLength(1);
    expect(names(`#{${"a".repeat(65)}}`)).toHaveLength(0);
  });

  it("英数字・_・- を使える", () => {
    expect(names("#{a-b_c9}")).toEqual(["a-b_c9"]);
  });

  it("全角の ＃｛ は変数でない", () => {
    expect(names("＃｛host｝")).toEqual([]);
  });
});

describe("D-27: ID", () => {
  it("UUID v7 を返す", () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
