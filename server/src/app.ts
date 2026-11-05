import { Hono } from "hono";
import { authRoutes } from "./auth/routes.ts";
import { meRoutes } from "./features/me/routes.ts";
import { AppError, problemResponse } from "./lib/errors.ts";
import type { AppEnv } from "./lib/hono.ts";
import { logger } from "./lib/logger.ts";
import { verifyOrigin } from "./middleware/csrf.ts";
import { requirePasswordChanged, requireSession } from "./middleware/session.ts";

// Hono のアプリの組み立て（conventions.md 1章）。
// ミドルウェアは登録した順に効く。下に足すルートほど、多くの確認を通る。
export const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(verifyOrigin)
  // Better Auth の入口（ログイン・ログアウトなど）。セッションの確認より前に置く。
  .route("/auth", authRoutes)
  .get("/health", (c) => c.json({ status: "ok" }))
  // ここから下はログインが必要
  .use(requireSession)
  .route("/me", meRoutes)
  // ここから下はパスワードの変更が済んでいることが必要
  .use(requirePasswordChanged);

app.notFound(() => problemResponse("NOT_FOUND"));

app.onError((err) => {
  if (err instanceof AppError) {
    return problemResponse(err.code, err.message, err.extra);
  }
  logger.error({ err }, "想定していないエラー");
  return problemResponse("INTERNAL_ERROR");
});

export type AppType = typeof app;
