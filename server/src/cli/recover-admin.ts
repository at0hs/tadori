import { pool } from "../db/client.ts";
import { recoverAdmin } from "../features/users/recover.ts";
import { alsoLogToContainer } from "./container-log.ts";

// 管理者を復旧するコマンド（D-51、operations.md 8章）。app コンテナの中でだけ実行する。
//   node src/cli/recover-admin.ts <ユーザー名>
// 仮のパスワードは引数で受け取らず、作ったものを一度だけ標準エラー出力に出す
// （標準出力は操作ログの JSON が流れるので混ぜない）。

const username = process.argv[2];
if (!username) {
  process.stderr.write("使い方：node src/cli/recover-admin.ts <ユーザー名>\n");
  process.exit(2);
}

// 操作ログ（user.recovered）を、実行した端末だけでなくコンテナのログにも残す（受入テストの P-4）
alsoLogToContainer();

try {
  const { password } = await recoverAdmin(username);
  process.stderr.write(
    [
      `ユーザー「${username}」を管理者として復旧しました。`,
      `仮のパスワード：${password}`,
      "このパスワードは二度と表示しません。ログインすると、パスワードの変更を求められます。",
      "",
    ].join("\n"),
  );
} catch (err) {
  process.stderr.write(
    `復旧できませんでした：${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
