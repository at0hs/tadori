import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VersionResponse } from "@tadori/shared";

// 動いているビルドの版と SHA（D-69）。起動時に1回だけ決める。
// 版はルートの package.json、SHA はイメージのビルドで作る COMMIT のファイル（Dockerfile の commit の段）。
// COMMIT がなければ（開発時）git に聞き、それもだめなら "unknown" にする。

/** 作業ツリーの短い SHA を返す。git がない・作業ツリーでないときは null。 */
export type GitRunner = (cwd: string) => string | null;

const UNKNOWN = "unknown";

const defaultGit: GitRunner = (cwd) => {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};

function readCommitFile(rootDir: string): string | null {
  try {
    return readFileSync(join(rootDir, "COMMIT"), "utf8").trim();
  } catch {
    return null;
  }
}

export function readVersionInfo(opts: { rootDir?: string; git?: GitRunner } = {}): VersionResponse {
  const rootDir = opts.rootDir ?? fileURLToPath(new URL("../../", import.meta.url));
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
    version?: string;
  };
  const file = readCommitFile(rootDir);
  const commit = file === null ? (opts.git ?? defaultGit)(rootDir) : file;
  return { version: pkg.version ?? UNKNOWN, commit: commit || UNKNOWN };
}

export const versionInfo: VersionResponse = readVersionInfo();
