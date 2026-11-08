import { logger } from "./logger.ts";

// 操作ログ（F-10、conventions.md 6.2）。JSON の1行で標準出力に出す。DB には保存しない。
// 状態を変える操作では、トランザクションをコミットした後に出す（4.1）。

/** リクエストごとの情報。復旧のコマンド（D-51）のように、リクエストの外から出すときは空でよい。 */
export type RequestMeta = {
  requestId?: string;
  /** 接続元の IP（D-52、D-60）。Better Auth と同じ処理で決める（auth/client-ip.ts）。 */
  ip?: string | null;
};

/** 操作の種類。`<対象>.<操作>` の形。足すときは conventions.md 6.2 の例にも合わせる。 */
export type OperationEvent =
  | "auth.login_succeeded"
  | "auth.login_failed"
  | "user.created"
  | "user.banned"
  | "user.role_changed"
  | "user.password_reset"
  | "user.recovered"
  | "procedure.published"
  | "procedure.archived"
  | "execution.started"
  | "execution.finished"
  | "execution.cancelled"
  | "execution.approved"
  | "execution.rejected"
  | "execution.exported";

export type OperationTarget = { type: "user" | "procedure" | "execution"; id: string };

export type OperationEntry = {
  event: OperationEvent;
  /** 操作した人。ログインの失敗で、入力されたユーザー名が存在しなければ出さない（6.2）。 */
  actorId?: string | null;
  target?: OperationTarget;
  /** 操作に固有の情報（付与したロールなど）。パスワードや利用者が入力したテキストは入れない（6.3）。 */
  [key: string]: unknown;
};

export function logOperation(meta: RequestMeta, entry: OperationEntry, msg: string) {
  const { event, actorId, target, ...rest } = entry;
  logger.info(
    {
      requestId: meta.requestId,
      event,
      ...(actorId ? { actorId } : {}),
      ip: meta.ip ?? undefined,
      ...(target ? { target } : {}),
      ...rest,
    },
    msg,
  );
}
