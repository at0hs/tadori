import { describe, expect, it } from "vitest";
import { formatLicenses } from "./third-party-licenses.ts";

// ブラウザに配る JS に含まれるライブラリのライセンス一覧（D-69）
const dep = (name: string | null, license: string | null, licenseText: string | null) => ({
  name,
  version: "1.2.3",
  license,
  licenseText,
});

describe("formatLicenses", () => {
  it("名前の順に、名前とライセンスの種類と本文を書く", () => {
    const text = formatLicenses([
      dep("zod", "MIT", "Copyright zod"),
      dep("@scope/bar", "ISC", "Copyright bar"),
    ]);
    expect(text.startsWith("Tadori に含まれるライブラリのライセンス\n")).toBe(true);
    expect(text.indexOf("@scope/bar (ISC)")).toBeLessThan(text.indexOf("zod (MIT)"));
    expect(text).toContain("\nzod (MIT)\n");
    expect(text).toContain("Copyright zod");
  });

  it("版を書かない", () => {
    expect(formatLicenses([dep("foo", "MIT", "text")])).not.toContain("1.2.3");
  });

  it("LICENSE のファイルがなければそう書き、種類が分からなければ UNKNOWN", () => {
    const text = formatLicenses([dep("foo", null, null)]);
    expect(text).toContain("foo (UNKNOWN)");
    expect(text).toContain("LICENSE のファイルがありません");
  });

  it("同じ名前で同じ本文は1つにまとめ、本文が違えば両方残す", () => {
    const text = formatLicenses([
      dep("foo", "MIT", "A"),
      dep("foo", "MIT", "A"),
      dep("bar", "MIT", "B1"),
      dep("bar", "MIT", "B2"),
    ]);
    expect(text.match(/^foo \(MIT\)$/gm)).toHaveLength(1);
    expect(text.match(/^bar \(MIT\)$/gm)).toHaveLength(2);
  });

  it("Tadori 自身（@tadori/）と名前のないものは含めない", () => {
    const text = formatLicenses([dep("@tadori/shared", "MIT", "x"), dep(null, "MIT", "y")]);
    expect(text).not.toContain("@tadori/");
    expect(text).not.toContain("(MIT)");
  });
});
