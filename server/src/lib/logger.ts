import pino from "pino";

// JSON の1行ずつを標準出力に出す（D-15、conventions.md 6章）。
// パスワード・Cookie・セッションのトークンは伏せる（6.3）。
export const logger = pino({
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
});
