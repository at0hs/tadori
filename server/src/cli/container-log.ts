import { openSync } from "node:fs";
import pino from "pino";
import { addLogDestination } from "../lib/logger.ts";

/**
 * docker compose exec で実行したコマンドのログを、コンテナのログ（docker compose logs）にも出す。
 * コンテナのログに残るのは PID 1（app の本体）の標準出力だけなので、そこにも書く（受入テストの P-4）。
 * コンテナの外（開発環境）や、書けないときは何もしない。実行した端末の標準出力にはこれまでどおり出る。
 */
export function alsoLogToContainer(path = "/proc/1/fd/1"): boolean {
  if (process.pid === 1 || process.platform !== "linux") return false;
  let fd: number;
  try {
    fd = openSync(path, "a");
  } catch {
    return false;
  }
  const stream = pino.destination({ fd, sync: true });
  // 書けなくなっても例外にしない。復旧のコマンドでは、コミットした後に操作ログを出すので、
  // ここで落ちると、復旧はできたのに仮のパスワードを出せなくなる。実行した端末にはこれまでどおり出る
  stream.on("error", () => {});
  addLogDestination(stream);
  return true;
}
