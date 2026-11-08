import type { HttpBindings } from "@hono/node-server";
import type { Role } from "@tadori/shared";
import type { Context } from "hono";
import type { RequestMeta } from "./operation-log.ts";

// 操作する人（conventions.md 2.1）。ロールはリクエストのたびに DB から読む（D-35）。1人1つ（D-64）。
export type Actor = {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
};

export type AppEnv = {
  Bindings: HttpBindings;
  Variables: {
    actor: Actor;
    /** リクエスト ID と接続元の IP（middleware/request-context.ts）。 */
    meta: RequestMeta;
    /** X-Forwarded-For を付け直したリクエストのヘッダ（D-60）。Better Auth に渡すときに使う。 */
    authHeaders: Headers;
  };
};

/**
 * サービスに渡す「操作する人とリクエストの情報」（conventions.md 2.1）。
 * サービスは Context を受け取らないので、ルートでこれに詰め替える。
 */
export type Operator = {
  actor: Actor;
  meta: RequestMeta;
  /** Better Auth の admin の API を、操作する人のセッションで呼ぶため（authorization.md 4.2）。 */
  authHeaders: Headers;
};

export function operatorOf(c: Context<AppEnv>): Operator {
  return { actor: c.get("actor"), meta: c.get("meta"), authHeaders: c.get("authHeaders") };
}
