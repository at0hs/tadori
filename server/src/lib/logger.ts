import pino from "pino";

// 出し先。既定は標準出力だけで、pino の既定と同じもの（非同期に書き、終わるときに吐き出す）を使う。
// レベルはロガーの側で絞るので、出し先では絞らない（trace）。
const streams = pino.multistream([{ level: "trace", stream: pino.destination(1) }]);

// JSON の1行ずつを標準出力に出す（D-15、conventions.md 6章）。
// パスワード・Cookie・セッションのトークンは伏せる（6.3）。
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "password",
        "*.password",
        "currentPassword",
        "*.currentPassword",
        "newPassword",
        "*.newPassword",
        "cookie",
        "*.cookie",
        "token",
        "*.token",
        'headers["cookie"]',
        'headers["set-cookie"]',
      ],
      censor: "[REDACTED]",
    },
  },
  streams,
);

/** ログの出し先を足す。コンテナの中で実行するコマンドのログを、コンテナのログにも出すため（cli/container-log.ts）。 */
export function addLogDestination(stream: pino.DestinationStream): void {
  streams.add({ level: "trace", stream });
}
