import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { approvalEvents, executions } from "../../db/schema/executions.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";
import { assertOwner, type ExecutionRow, lockExecution } from "../executions/queries.ts";

// 承認・差し戻し・再依頼（state-transitions.md 5章、authorization.md 3.4）。
// 実行の行をロックしてから確かめ、executions と approval_events を同じトランザクションで更新する
// （data-model.md 4.3）。承認者ロールの確認はルートの requireRole で済んでいる。
// コメントは操作ログに出さない（conventions.md 6.3）。

/** 職務分離：自分が実行者である実行は承認・差し戻しできない（F-08 の AC）。 */
function assertReviewable(op: Operator, row: ExecutionRow) {
  if (row.executorId === op.actor.id) {
    throw new AppError("FORBIDDEN", "自分の実行は承認・差し戻しできません。");
  }
  if (row.approvalStatus !== "pending") {
    throw new AppError("STATE_CONFLICT", "この実行は承認待ちではありません。");
  }
}

async function decide(
  op: Operator,
  id: string,
  kind: "approved" | "rejected",
  comment: string | null,
) {
  await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertReviewable(op, row);
    await tx
      .update(executions)
      .set({
        approvalStatus: kind,
        approvalDecidedBy: op.actor.id,
        approvalDecidedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(executions.id, id));
    await tx
      .insert(approvalEvents)
      .values({ executionId: id, kind, comment, actorId: op.actor.id });
  });
  logOperation(
    op.meta,
    { event: `execution.${kind}`, actorId: op.actor.id, target: { type: "execution", id } },
    kind === "approved" ? "実行を承認した" : "実行を差し戻した",
  );
}

/** 承認する。 */
export function approveExecution(op: Operator, id: string): Promise<void> {
  return decide(op, id, "approved", null);
}

/** 差し戻す。コメントは必須（ルートの検証で済んでいる）。 */
export function rejectExecution(op: Operator, id: string, comment: string): Promise<void> {
  return decide(op, id, "rejected", comment);
}

/** 再依頼する。本人だけ（D-35）。承認待ちに戻す。ログは出さない（api.md 4.5）。 */
export async function resubmitExecution(op: Operator, id: string, comment: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertOwner(op.actor, row);
    if (row.approvalStatus !== "rejected") {
      throw new AppError("STATE_CONFLICT", "この実行は差し戻されていません。");
    }
    await tx
      .update(executions)
      .set({ approvalStatus: "pending", updatedAt: sql`now()` })
      .where(eq(executions.id, id));
    await tx
      .insert(approvalEvents)
      .values({ executionId: id, kind: "requested", comment, actorId: op.actor.id });
  });
}
