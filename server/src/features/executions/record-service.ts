import type { ProcedureContent, StepStatusChangeRequest, StepStatusConflict } from "@tadori/shared";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import {
  executionSteps,
  executions,
  executionVariables,
  stepComments,
  stepEvidences,
  stepStatusEvents,
} from "../../db/schema/executions.ts";
import { procedureVersions } from "../../db/schema/procedures.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { type Tx, userNames } from "../procedures/queries.ts";
import { assertOwner, checkVariables, type ExecutionRow, lockExecution } from "./queries.ts";

// 変数の変更・ステップの状態・コメント・エビデンス（F-04、F-06、state-transitions.md 3.2・4.2）。
// どの操作も、実行の行をロックしてから本人と状態を確かめる（conventions.md 4.2、D-46）。
// 書き込んだら executions.updated_at を更新する（state-transitions.md 1章）。

async function versionContent(tx: Tx, row: ExecutionRow): Promise<ProcedureContent> {
  const [v] = await tx
    .select({ content: procedureVersions.content })
    .from(procedureVersions)
    .where(eq(procedureVersions.id, row.versionId));
  if (!v) throw new Error("実行の版の行がない");
  return v.content;
}

async function touch(tx: Tx, id: string) {
  await tx.update(executions).set({ updatedAt: sql`now()` }).where(eq(executions.id, id));
}

async function findStep(tx: Tx, id: string, stepId: string) {
  const [step] = await tx
    .select()
    .from(executionSteps)
    .where(and(eq(executionSteps.executionId, id), eq(executionSteps.stepId, stepId)));
  if (!step) throw new AppError("NOT_FOUND");
  return step;
}

/** 秘密でない変数の値を置き換える。最初にステップの状態を変えた後はできない（F-04、D-04）。 */
export async function updateVariables(op: Operator, id: string, values: Record<string, string>) {
  await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertOwner(op.actor, row);
    if (row.status !== "running") {
      throw new AppError("STATE_CONFLICT", "終了した実行の変数は変更できません。");
    }
    if (row.variablesLockedAt !== null) {
      throw new AppError(
        "STATE_CONFLICT",
        "最初のステップの状態を変えた後は、変数の値を変更できません。",
      );
    }
    checkVariables(await versionContent(tx, row), values);
    await tx.delete(executionVariables).where(eq(executionVariables.executionId, id));
    const entries = Object.entries(values);
    if (entries.length > 0) {
      await tx
        .insert(executionVariables)
        .values(entries.map(([name, value]) => ({ executionId: id, name, value })));
    }
    await touch(tx, id);
  });
}

/** ステップの状態を変える（F-06）。画面が見ていた状態と照合する（D-46）。 */
export async function changeStepStatus(
  op: Operator,
  id: string,
  stepId: string,
  req: StepStatusChangeRequest,
) {
  await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertOwner(op.actor, row);
    if (row.status !== "running") {
      throw new AppError("STATE_CONFLICT", "終了した実行のステップは変更できません。");
    }
    const step = await findStep(tx, id, stepId);
    if (step.status !== req.from) {
      const name = await userNames(tx, step.updatedBy ? [step.updatedBy] : []);
      const extra: StepStatusConflict = {
        stepId,
        currentStatus: step.status,
        updatedBy: step.updatedBy ? name(step.updatedBy) : null,
        updatedAt: step.updatedAt?.toISOString() ?? null,
      };
      throw new AppError("STEP_STATUS_CONFLICT", undefined, extra);
    }
    if (req.to === "done") {
      const content = await versionContent(tx, row);
      const def = [...content.steps, ...content.rollbackSteps].find((s) => s.id === stepId);
      if (def?.evidenceRequired) {
        const [ev] = await tx
          .select({ id: stepEvidences.id })
          .from(stepEvidences)
          .where(and(eq(stepEvidences.executionId, id), eq(stepEvidences.stepId, stepId)))
          .limit(1);
        if (!ev) {
          throw new AppError("STATE_CONFLICT", "エビデンスを登録してから完了にしてください。");
        }
      }
    }
    const skipReason = req.to === "skipped" ? req.skipReason : null;
    await tx
      .update(executionSteps)
      .set({ status: req.to, skipReason, updatedBy: op.actor.id, updatedAt: sql`now()` })
      .where(and(eq(executionSteps.executionId, id), eq(executionSteps.stepId, stepId)));
    await tx.insert(stepStatusEvents).values({
      executionId: id,
      stepId,
      fromStatus: req.from,
      toStatus: req.to,
      skipReason,
      changedBy: op.actor.id,
    });
    await tx
      .update(executions)
      .set({
        updatedAt: sql`now()`,
        ...(row.variablesLockedAt === null ? { variablesLockedAt: sql`now()` } : {}),
      })
      .where(eq(executions.id, id));
  });
}

/** コメント・エビデンスを足す（D-25）。実行中か、差し戻しの後だけ（state-transitions.md 4.2）。 */
async function append(
  op: Operator,
  id: string,
  stepId: string,
  table: typeof stepComments | typeof stepEvidences,
  body: string,
) {
  await db.transaction(async (tx) => {
    const row = await lockExecution(tx, id);
    assertOwner(op.actor, row);
    if (row.status !== "running" && row.approvalStatus !== "rejected") {
      throw new AppError("STATE_CONFLICT", "今の状態では追記できません。");
    }
    await findStep(tx, id, stepId);
    await tx.insert(table).values({ executionId: id, stepId, body, createdBy: op.actor.id });
    await touch(tx, id);
  });
}

export function addComment(op: Operator, id: string, stepId: string, body: string) {
  return append(op, id, stepId, stepComments, body);
}

export function addEvidence(op: Operator, id: string, stepId: string, body: string) {
  return append(op, id, stepId, stepEvidences, body);
}
