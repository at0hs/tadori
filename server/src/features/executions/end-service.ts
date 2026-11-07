import { type FinishExecutionResponse, finishOutcome } from "@tadori/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { approvalEvents, executionSteps, executions } from "../../db/schema/executions.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";
import { assertOwner, executorBlocked, lockExecution } from "./queries.ts";

// 実行の終了と中止（state-transitions.md 3.2・3.3、D-36）。
// 実行の行をロックしてから確かめる（conventions.md 4.2）。操作ログはコミットの後に出す。

/** 終了する。完了か異常終了にして、承認待ちにする（state-transitions.md 5章）。 */
export async function finishExecution(op: Operator, id: string): Promise<FinishExecutionResponse> {
  const status = await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertOwner(op.actor, row);
    if (row.status !== "running") {
      throw new AppError("STATE_CONFLICT", "この実行はすでに終わっています。");
    }
    const steps = await tx
      .select({ section: executionSteps.section, status: executionSteps.status })
      .from(executionSteps)
      .where(eq(executionSteps.executionId, id));
    const outcome = finishOutcome(steps);
    if (outcome === null) {
      throw new AppError(
        "STATE_CONFLICT",
        "手順に未実施のステップが残っています。完了かスキップにするか、作業をやめるなら中止してください。",
      );
    }
    await tx
      .update(executions)
      .set({
        status: outcome,
        endedAt: sql`now()`,
        approvalStatus: "pending",
        updatedAt: sql`now()`,
      })
      .where(eq(executions.id, id));
    await tx
      .insert(approvalEvents)
      .values({ executionId: id, kind: "requested", comment: null, actorId: op.actor.id });
    return outcome;
  });

  logOperation(
    op.meta,
    {
      event: "execution.finished",
      actorId: op.actor.id,
      target: { type: "execution", id },
      status,
    },
    "実行を終了した",
  );
  return { status };
}

/**
 * 中止する。本人（実行者ロールあり）は理由なしでよい。
 * 実行者がもう操作できない（無効化・ロールの剥奪）ときだけ、管理者が理由を入れて中止できる（D-36）。
 */
export async function cancelExecution(op: Operator, id: string, reason: string) {
  const { actor } = op;
  const by = await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    let by: "executor" | "admin";
    if (row.executorId === actor.id && actor.roles.includes("executor")) {
      by = "executor";
    } else if (actor.roles.includes("admin") && (await executorBlocked(tx, row.executorId))) {
      by = "admin";
    } else {
      throw new AppError("FORBIDDEN", "この実行を操作できるのは実行者本人だけです。");
    }
    if (row.status !== "running") {
      throw new AppError("STATE_CONFLICT", "この実行はすでに終わっています。");
    }
    if (by === "admin" && reason === "") {
      throw new AppError("VALIDATION_FAILED", undefined, {
        errors: [{ path: "reason", message: "中止の理由を入力してください。" }],
      });
    }
    await tx
      .update(executions)
      .set({
        status: "cancelled",
        endedAt: sql`now()`,
        cancelledBy: actor.id,
        cancelReason: reason === "" ? null : reason,
        updatedAt: sql`now()`,
      })
      .where(eq(executions.id, id));
    return by;
  });

  // 実行者が入力した理由は、秘密変数の値が紛れ込むおそれがあるのでログに出さない（conventions.md 6.3、D-56）
  logOperation(
    op.meta,
    {
      event: "execution.cancelled",
      actorId: actor.id,
      target: { type: "execution", id },
      by,
      ...(by === "admin" ? { reason } : {}),
    },
    "実行を中止した",
  );
}
