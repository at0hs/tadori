import { ROLES, roleSchema } from "@tadori/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getSession } from "../auth/session.ts";
import { db } from "../db/client.ts";
import { userRoles } from "../db/schema/users.ts";
import { AppError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";

/** ログインしていることを確かめ、操作する人を c.get("actor") に置く（authorization.md 2章の 1）。 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const { session, setCookies } = await getSession(c.req.raw.headers);
  if (!session) throw new AppError("UNAUTHENTICATED");

  // ロールはリクエストのたびに DB から読み、キャッシュしない（D-35）。
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, session.user.id));

  c.set("actor", {
    id: session.user.id,
    name: session.user.name,
    username: session.user.username ?? "",
    // ROLES の順に並べる（管理者の API と揃える）
    roles: rows
      .map((r) => roleSchema.parse(r.role))
      .sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)),
    mustChangePassword: session.user.mustChangePassword === true,
  });

  await next();

  // 期限を延ばした Cookie を応答に移す（D-14 の補足）。後ろでエラーになっても移す。
  for (const cookie of setCookies) c.res.headers.append("set-cookie", cookie);
});

/** パスワード変更が必要な人を止める（authorization.md 2章の 2）。 */
export const requirePasswordChanged = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("actor").mustChangePassword) throw new AppError("PASSWORD_CHANGE_REQUIRED");
  await next();
});
