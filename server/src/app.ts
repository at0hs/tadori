import { Hono } from "hono";

// Hono のアプリの組み立て（conventions.md 1章）。
// ミドルウェア・ルート・エラー処理はここに足していく。
export const app = new Hono().basePath("/api").get("/health", (c) => c.json({ status: "ok" }));

export type AppType = typeof app;
