import { describe, expect, it } from "vitest";
import { findVariableRefs } from "./parse.ts";
import { maskSecrets, SECRET_MASK, splitVariables } from "./substitute.ts";

describe("splitVariables", () => {
  it("文字と変数の参照に分ける", () => {
    expect(splitVariables("ssh #{host} -p #{port}")).toEqual([
      { type: "text", text: "ssh " },
      { type: "var", name: "host" },
      { type: "text", text: " -p " },
      { type: "var", name: "port" },
    ]);
  });

  it("エスケープと規則に合わない参照は文字のまま、隣り合う文字は1つにまとめる", () => {
    expect(splitVariables("##{host} と #{a b} と #{}")).toEqual([
      { type: "text", text: "#{host} と #{a b} と #{}" },
    ]);
  });

  it("エスケープは前の # を1つだけ取り除く", () => {
    expect(splitVariables("###{x}")).toEqual([{ type: "text", text: "##{x}" }]);
  });

  it("続けて書いた参照は別々の変数になる", () => {
    expect(splitVariables("#{x}#{y}")).toEqual([
      { type: "var", name: "x" },
      { type: "var", name: "y" },
    ]);
  });

  it("空の文字列は空の配列", () => {
    expect(splitVariables("")).toEqual([]);
  });

  it.each([
    "ssh #{host} -p #{port}",
    "##{host} #{a b} #{x}",
    "###{x}#{y}",
    "#{x}#{y}##{z}",
    "a #{} #{1a} #{ok_1-2} }",
  ])("findVariableRefs と同じ規則で変数を見つける：%s", (t) => {
    const vars = splitVariables(t).flatMap((s) => (s.type === "var" ? [s.name] : []));
    expect(vars).toEqual(findVariableRefs(t).map((r) => r.name));
  });
});

describe("maskSecrets", () => {
  it("すべての出現を置き換える", () => {
    expect(maskSecrets("pw=Dummy-Pass-123 again Dummy-Pass-123", ["Dummy-Pass-123"])).toBe(
      `pw=${SECRET_MASK} again ${SECRET_MASK}`,
    );
  });

  it("値が別の値を含むときは、まとめて1つの ●●●● にする", () => {
    expect(maskSecrets("abcdefgh", ["abcd", "abcdefgh"])).toBe(SECRET_MASK);
  });

  it("2つの値の端が重なってつながっていても、どちらの一部も残さない", () => {
    expect(maskSecrets("x abcdefgh y", ["abcdef", "efgh"])).toBe(`x ${SECRET_MASK} y`);
    expect(maskSecrets("x efghabcdef y", ["abcdef", "efgh"])).toBe(`x ${SECRET_MASK} y`);
  });

  it("同じ値の出現が重なっていても、残さない", () => {
    expect(maskSecrets("aaaaa", ["aaaa"])).toBe(SECRET_MASK);
  });

  it("正規表現の記号を文字どおりに扱う", () => {
    expect(maskSecrets("x a.b*$1 y", ["a.b*$1"])).toBe(`x ${SECRET_MASK} y`);
    expect(maskSecrets("aXb", ["a.b"])).toBe("aXb");
  });

  it("空の値・値なしは何もしない", () => {
    expect(maskSecrets("abc", [""])).toBe("abc");
    expect(maskSecrets("abc", [])).toBe("abc");
  });

  it("マスクの文字は ●●●●", () => {
    expect(SECRET_MASK).toBe("●●●●");
  });
});
