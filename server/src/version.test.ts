import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readVersionInfo } from "./version.ts";

// 版と SHA の決め方（D-69）
let rootDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "tadori-version-"));
  writeFileSync(join(rootDir, "package.json"), JSON.stringify({ version: "9.8.7" }));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("readVersionInfo", () => {
  it("COMMIT のファイルがあれば、その中身（前後の空白を除く）を使い、git は呼ばない", () => {
    writeFileSync(join(rootDir, "COMMIT"), "abc1234\n");
    const git = vi.fn(() => "zzzzzzz");
    expect(readVersionInfo({ rootDir, git })).toEqual({ version: "9.8.7", commit: "abc1234" });
    expect(git).not.toHaveBeenCalled();
  });

  it("COMMIT のファイルがなければ、git の結果を使う", () => {
    const git = vi.fn(() => "def5678");
    expect(readVersionInfo({ rootDir, git })).toEqual({ version: "9.8.7", commit: "def5678" });
    expect(git).toHaveBeenCalledWith(rootDir);
  });

  it("COMMIT が空で git も null なら unknown", () => {
    writeFileSync(join(rootDir, "COMMIT"), "");
    expect(readVersionInfo({ rootDir, git: () => null }).commit).toBe("unknown");
  });

  it("既定の git は、git の作業ツリーでない所では null になる", () => {
    // 一時ディレクトリが作業ツリーの中にある環境でも、上をたどらせない
    vi.stubEnv("GIT_CEILING_DIRECTORIES", dirname(rootDir));
    try {
      expect(readVersionInfo({ rootDir }).commit).toBe("unknown");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
