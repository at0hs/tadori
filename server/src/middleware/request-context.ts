import { createMiddleware } from "hono/factory";
import { REQUEST_ID_HEADER } from "../auth/auth.ts";
import { clientIp, rewriteHeaders } from "../auth/client-ip.ts";
import type { AppEnv } from "../lib/hono.ts";

/**
 * リクエスト ID を振り、接続元の IP を決める（conventions.md 6.1、D-60）。最初に置く。
 * 付け直したヘッダは、Better Auth に渡すときと、操作ログの IP に使う。
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const authHeaders = rewriteHeaders(c);
  authHeaders.set(REQUEST_ID_HEADER, requestId);
  c.set("authHeaders", authHeaders);
  c.set("meta", { requestId, ip: clientIp(authHeaders) });
  await next();
});
