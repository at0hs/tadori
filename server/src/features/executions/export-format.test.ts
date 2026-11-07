import { describe, expect, it } from "vitest";
import { contentDisposition, exportFileName, formatJst } from "./export-format.ts";

describe("formatJst", () => {
  it("日本時間にする", () => {
    expect(formatJst("2026-11-07T15:30:00.000Z")).toBe("2026-11-08 00:30");
  });
});

describe("exportFileName", () => {
  it("手順書名_v版数_開始日", () => {
    expect(exportFileName("Web サーバーの証明書更新", 3, "2026-11-07T01:00:00.000Z")).toEqual({
      name: "Web サーバーの証明書更新_v3_20261107.xlsx",
      ascii: "execution_v3_20261107.xlsx",
    });
  });

  it("開始日は日本時間", () => {
    expect(exportFileName("a", 1, "2026-11-06T15:30:00.000Z").name).toBe("a_v1_20261107.xlsx");
  });

  it("使えない文字と改行は _", () => {
    expect(exportFileName('a\\b/c:d*e?f"g<h>i|j\r\nk', 1, "2026-11-07T01:00:00.000Z").name).toBe(
      "a_b_c_d_e_f_g_h_i_j__k_v1_20261107.xlsx",
    );
  });
});

describe("contentDisposition", () => {
  it("filename* と ASCII の filename", () => {
    expect(
      contentDisposition({ name: "手順 (1)'*_v3.xlsx", ascii: "execution_v3_20261107.xlsx" }),
    ).toBe(
      `attachment; filename="execution_v3_20261107.xlsx"; filename*=UTF-8''${encodeURIComponent("手順")}%20%281%29%27%2A_v3.xlsx`,
    );
  });
});
