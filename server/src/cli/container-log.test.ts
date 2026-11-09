import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { logger } from "../lib/logger.ts";
import { alsoLogToContainer } from "./container-log.ts";

// テストではログを止めている（LOG_LEVEL=silent）ので、この中だけ info にする
let level: string;
let dir: string;
beforeEach(() => {
  level = logger.level;
  logger.level = "info";
  dir = mkdtempSync(join(tmpdir(), "container-log-"));
});
afterEach(() => {
  logger.level = level;
  rmSync(dir, { recursive: true, force: true });
});

describe("alsoLogToContainer（受入テスト P-4）", () => {
  it.skipIf(process.platform !== "linux")(
    "D-51: 操作ログを、コンテナの本体の標準出力にあたる出し先にも JSON で書く",
    () => {
      const path = join(dir, "pid1-stdout");
      writeFileSync(path, "");
      expect(alsoLogToContainer(path)).toBe(true);
      logger.info({ event: "user.recovered", target: { type: "user", id: "u1" } }, "復旧した");
      const lines = readFileSync(path, "utf8").trim().split("\n");
      expect(lines.map((l) => JSON.parse(l))).toEqual([
        expect.objectContaining({ event: "user.recovered", msg: "復旧した" }),
      ]);
    },
  );

  it("書けない出し先なら何もしない", () => {
    expect(alsoLogToContainer(join(dir, "no-such-dir", "stdout"))).toBe(false);
  });
});
