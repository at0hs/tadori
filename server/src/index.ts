import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { config } from "./config.ts";
import { db, pool } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { ensureInitialAdmin } from "./features/users/initial-admin.ts";
import { logger } from "./lib/logger.ts";

// 起動（conventions.md 1章）：マイグレーション → 初期管理者 → 待ち受け
await runMigrations(db);
logger.info("マイグレーションを適用した");

await ensureInitialAdmin(config);

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, "待ち受けを開始した");
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
