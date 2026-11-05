import { createMiddleware } from "hono/factory";
import { appOrigin } from "../config.ts";
import { AppError } from "../lib/errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 状態を変えるすべてのリクエストで、出どころを確かめる（D-61、conventions.md 5章）。
 * Sec-Fetch-Site が same-origin か、Origin が APP_URL のオリジンと同じなら通す。本文の種類によらない。
 * hono/csrf は JSON のリクエストを確かめないので使わない（library-checks.md CS-01）。
 */
export const verifyOrigin = createMiddleware(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const sameSite = c.req.header("sec-fetch-site") === "same-origin";
    const sameOrigin = c.req.header("origin") === appOrigin;
    if (!sameSite && !sameOrigin) {
      throw new AppError("FORBIDDEN", "リクエストの出どころを確かめられませんでした。");
    }
  }
  await next();
});
