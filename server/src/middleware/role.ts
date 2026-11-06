import type { Role } from "@tadori/shared";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";

/**
 * 操作に必要なロールを持っているかを確かめる（authorization.md 2章の 3）。
 * 挙げたロールのどれかを持っていれば通す。ロールは requireSession がリクエストのたびに DB から読んだもの（D-35）。
 */
export function requireRole(...roles: [Role, ...Role[]]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const actor = c.get("actor");
    if (!roles.some((role) => actor.roles.includes(role))) throw new AppError("FORBIDDEN");
    await next();
  });
}
