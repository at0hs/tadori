import { serve } from "@hono/node-server";
import { app } from "./app.ts";

// 起動（conventions.md 1章）。マイグレーションと初期管理者の作成は認証の骨組みで足す。
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`listening on http://localhost:${info.port}`);
});
