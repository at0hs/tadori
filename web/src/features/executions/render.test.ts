import { SECRET_MASK } from "@tadori/shared";
import { describe, expect, it } from "vitest";
import { maskInput, maskReason, renderPieces, renderPlain, textForCopy } from "./render.ts";

const values = { host: "web01.example.test", port: "22" };
const base = { values, secretNames: ["admin_password"], reveal: false };
const secrets = { admin_password: "Dummy-Pass-123" };

describe("renderPlain", () => {
  it("変数を値に置き換えた文字列（進捗のステップ一覧の題名など）", () => {
    expect(renderPlain("#{host} に接続する", base)).toBe("web01.example.test に接続する");
  });

  it("秘密変数は、表示しないときはマスクする", () => {
    expect(renderPlain("pw #{admin_password}", { ...base, secrets })).toBe(`pw ${SECRET_MASK}`);
  });
});

describe("textForCopy", () => {
  it("F-04 AC: コピーでは変数が値に置き換わる", () => {
    expect(textForCopy("ssh #{host} -p #{port}", base)).toBe("ssh web01.example.test -p 22");
  });

  it("秘密変数は、値があれば値でコピーする（表示がマスクでも）", () => {
    expect(textForCopy("pw #{admin_password}", { ...base, secrets })).toBe("pw Dummy-Pass-123");
  });

  it("秘密変数の値がなければ null", () => {
    expect(textForCopy("pw #{admin_password}", base)).toBeNull();
  });

  it("エスケープは #{name} の文字、規則外はそのまま", () => {
    expect(textForCopy("echo ##{host} #{a b}", base)).toBe("echo #{host} #{a b}");
  });
});

describe("renderPieces", () => {
  it("値は value、文字は text", () => {
    expect(renderPieces("ssh #{host}", base)).toEqual([
      { type: "text", text: "ssh " },
      { type: "value", name: "host", text: "web01.example.test" },
    ]);
  });

  it("reveal: false の秘密変数は ●●●●", () => {
    expect(renderPieces("#{admin_password}", { ...base, secrets })).toEqual([
      { type: "secret", name: "admin_password", text: SECRET_MASK, masked: true },
    ]);
  });

  it("reveal: true で値があれば値を見せる", () => {
    expect(renderPieces("#{admin_password}", { ...base, secrets, reveal: true })).toEqual([
      { type: "secret", name: "admin_password", text: "Dummy-Pass-123", masked: false },
    ]);
  });

  it("reveal: true でも値がなければ ●●●●", () => {
    expect(renderPieces("#{admin_password}", { ...base, reveal: true })).toEqual([
      { type: "secret", name: "admin_password", text: SECRET_MASK, masked: true },
    ]);
  });

  it("値のない秘密でない変数は #{name} の文字", () => {
    expect(renderPieces("#{unknown}", base)).toEqual([
      { type: "value", name: "unknown", text: "#{unknown}" },
    ]);
  });
});

describe("maskInput", () => {
  it("秘密変数の値をマスクする", () => {
    expect(maskInput("token Dummy-Pass-123", secrets)).toBe(`token ${SECRET_MASK}`);
  });

  it("secrets がなければそのまま", () => {
    expect(maskInput("token Dummy-Pass-123", undefined)).toBe("token Dummy-Pass-123");
  });
});

describe("maskReason", () => {
  it("前後の空白を取る前にマスクする（値の末尾が空白でも隠れる）", () => {
    expect(maskReason("理由 abcd ", { pw: "abcd " })).toBe(`理由 ${SECRET_MASK}`);
  });

  it("前後の空白を取る", () => {
    expect(maskReason("  理由  ", undefined)).toBe("理由");
  });
});
