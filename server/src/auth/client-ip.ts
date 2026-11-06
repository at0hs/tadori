import { getConnInfo } from "@hono/node-server/conninfo";
import { getIP } from "better-auth/api";
import type { Context } from "hono";
import { config } from "../config.ts";
import { auth } from "./auth.ts";

// 利用者の IP の決め方（D-60）。Better Auth に渡す前に X-Forwarded-For を付け直す。
// 操作ログ（F-10）の IP も同じ処理で決め、Better Auth がセッションに記録する IP とずらさない。

/** 接続相手のアドレス。分からなければ undefined。 */
export function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/**
 * 付け直した X-Forwarded-For の値。null ならヘッダを消す。
 * - プロキシを指定していない：接続相手のアドレスだけにする（利用者が付けた値は捨てる）。
 * - 指定している：受け取った値の末尾に接続相手のアドレスを足す。Better Auth が trustedProxies を右から外して読む。
 */
export function rewriteForwardedFor(
  received: string | null,
  socket: string | undefined,
  trustProxies: boolean,
): string | null {
  if (!socket) return null;
  if (!trustProxies || !received) return socket;
  return `${received}, ${socket}`;
}

/** リクエストのヘッダを写し、X-Forwarded-For を付け直したもの。Better Auth にはこれを渡す。 */
export function rewriteHeaders(c: Context): Headers {
  const headers = new Headers(c.req.raw.headers);
  const forwardedFor = rewriteForwardedFor(
    headers.get("x-forwarded-for"),
    socketAddress(c),
    config.TRUSTED_PROXIES.length > 0,
  );
  if (forwardedFor === null) headers.delete("x-forwarded-for");
  else headers.set("x-forwarded-for", forwardedFor);
  return headers;
}

/** 付け直したヘッダから、Better Auth と同じ処理で利用者の IP を読む（操作ログに使う）。 */
export function clientIp(rewritten: Headers): string | null {
  return getIP(rewritten, auth.options);
}
