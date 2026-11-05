import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

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
