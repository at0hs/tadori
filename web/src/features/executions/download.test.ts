import { expect, test } from "vitest";
import { exportPlacement, fileNameFromDisposition } from "./download.ts";

const NAME = "Web サーバーの証明書更新_v3_20261107.xlsx";

test("filename* を優先して日本語の名前に戻す", () => {
  expect(
    fileNameFromDisposition(
      `attachment; filename="execution_v3_20261107.xlsx"; filename*=UTF-8''${encodeURIComponent(NAME)}`,
    ),
  ).toBe(NAME);
});

test("filename* がなければ filename", () => {
  expect(fileNameFromDisposition('attachment; filename="a.xlsx"')).toBe("a.xlsx");
});

test("ヘッダがなければ null", () => {
  expect(fileNameFromDisposition(null)).toBeNull();
  expect(fileNameFromDisposition("attachment")).toBeNull();
});

test("exportPlacement：主な操作があれば「⋯」の中、なければボタン", () => {
  expect(exportPlacement(true, null)).toBe("menu");
  expect(exportPlacement(false, "review")).toBe("menu");
  expect(exportPlacement(false, "resubmit")).toBe("menu");
  expect(exportPlacement(false, null)).toBe("button");
});
