import { can, type Permission } from "@tadori/shared";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";

/**
 * 操作に必要なロールを持っているかを確かめる（authorization.md 2章の 3）。
 * 必要な最も低いロールは shared の PERMISSIONS に持つ（D-64）。ロールは requireSession が
 * リクエストのたびに DB から読んだもの（D-35）。
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!can(c.get("actor").role, permission)) throw new AppError("FORBIDDEN");
    await next();
  });
}
