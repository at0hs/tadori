import {
  can,
  type ExecutionDetailResponse,
  type ExecutionSummary,
  type HomeExecution,
  type RunningExecution,
  type StepRecord,
} from "@tadori/shared";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import {
  approvalEvents,
  executionSteps,
  executions,
  executionVariables,
  stepComments,
  stepEvidences,
  stepStatusEvents,
} from "../../db/schema/executions.ts";
import { procedureVersions } from "../../db/schema/procedures.ts";
import { AppError } from "../../lib/errors.ts";
import type { Actor } from "../../lib/hono.ts";
import { type Executor, titleOf, userNames } from "../procedures/queries.ts";
import { executorBlocked } from "./queries.ts";

// 実行の読み込み（api.md 4.4・5.1）。実行は全員が見られる（authorization.md 3.3）。
// 応答に含める情報は api.md 3章（D-49）に従う。他のユーザーは ID と名前だけ。
// 手順書名と文書は、実行の元にした版から取る（data-model.md 4.3）。

const iso = (d: Date) => d.toISOString();

/**
 * 実行の詳細（S-12）。canAdminCancel は管理者にだけ項目ごと返す（D-48）。
 * 何度かに分けて読むので、途中で記録が書き込まれても食い違わないよう、1つのスナップショットで読む。
 */
export function getExecution(actor: Actor, id: string): Promise<ExecutionDetailResponse> {
  return db.transaction((tx) => readExecution(tx, actor, id), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

async function readExecution(
  ex: Executor,
  actor: Actor,
  id: string,
): Promise<ExecutionDetailResponse> {
  const [row] = await ex
    .select({ e: executions, v: procedureVersions })
    .from(executions)
    .innerJoin(procedureVersions, eq(procedureVersions.id, executions.versionId))
    .where(eq(executions.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const { e, v } = row;

  const [variables, steps, events, comments, evidences, approvals] = await Promise.all([
    ex.select().from(executionVariables).where(eq(executionVariables.executionId, id)),
    ex.select().from(executionSteps).where(eq(executionSteps.executionId, id)),
    ex
      .select()
      .from(stepStatusEvents)
      .where(eq(stepStatusEvents.executionId, id))
      .orderBy(asc(stepStatusEvents.changedAt), asc(stepStatusEvents.id)),
    ex
      .select()
      .from(stepComments)
      .where(eq(stepComments.executionId, id))
      .orderBy(asc(stepComments.createdAt), asc(stepComments.id)),
    ex
      .select()
      .from(stepEvidences)
      .where(eq(stepEvidences.executionId, id))
      .orderBy(asc(stepEvidences.createdAt), asc(stepEvidences.id)),
    ex
      .select()
      .from(approvalEvents)
      .where(eq(approvalEvents.executionId, id))
      .orderBy(asc(approvalEvents.occurredAt), asc(approvalEvents.id)),
  ]);

  const name = await userNames(ex, [
    e.executorId,
    ...(e.cancelledBy ? [e.cancelledBy] : []),
    ...steps.flatMap((s) => (s.updatedBy ? [s.updatedBy] : [])),
    ...events.map((x) => x.changedBy),
    ...comments.map((x) => x.createdBy),
    ...evidences.map((x) => x.createdBy),
    ...approvals.map((x) => x.actorId),
  ]);

  const toRecord = (r: (typeof comments)[number]): StepRecord => ({
    id: r.id,
    body: r.body,
    createdBy: name(r.createdBy),
    createdAt: iso(r.createdAt),
  });
  const byStep = <T extends { stepId: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const x of list) map.set(x.stepId, [...(map.get(x.stepId) ?? []), x]);
    return (stepId: string) => map.get(stepId) ?? [];
  };
  const eventsOf = byStep(events);
  const commentsOf = byStep(comments);
  const evidencesOf = byStep(evidences);

  // ステップは版の文書の順（手順、切り戻し）に並べる
  const order = new Map(
    [...v.content.steps, ...v.content.rollbackSteps].map((s, i) => [s.id, i] as const),
  );
  const sorted = [...steps].sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));

  const body: ExecutionDetailResponse = {
    id: e.id,
    procedure: { id: e.procedureId, title: v.content.title },
    versionNo: v.versionNo,
    content: v.content,
    executor: name(e.executorId),
    status: e.status,
    approvalStatus: e.approvalStatus,
    startedAt: iso(e.startedAt),
    endedAt: e.endedAt ? iso(e.endedAt) : null,
    updatedAt: iso(e.updatedAt),
    cancelledBy: e.cancelledBy ? name(e.cancelledBy) : null,
    cancelReason: e.cancelReason,
    variables: Object.fromEntries(variables.map((x) => [x.name, x.value])),
    variablesLocked: e.variablesLockedAt !== null,
    steps: sorted.map((s) => ({
      stepId: s.stepId,
      section: s.section,
      status: s.status,
      skipReason: s.skipReason,
      updatedBy: s.updatedBy ? name(s.updatedBy) : null,
      updatedAt: s.updatedAt ? iso(s.updatedAt) : null,
      comments: commentsOf(s.stepId).map(toRecord),
      evidences: evidencesOf(s.stepId).map(toRecord),
      history: eventsOf(s.stepId).map((x) => ({
        from: x.fromStatus,
        to: x.toStatus,
        skipReason: x.skipReason,
        changedBy: name(x.changedBy),
        changedAt: iso(x.changedAt),
      })),
    })),
    approvals: approvals.map((x) => ({
      kind: x.kind,
      comment: x.comment,
      actor: name(x.actorId),
      occurredAt: iso(x.occurredAt),
    })),
  };
  if (can(actor.role, "cancelAsAdmin")) {
    body.canAdminCancel = e.status === "running" && (await executorBlocked(ex, e.executorId));
  }
  return body;
}

/**
 * 実行の一覧（S-11）。全件を返し、絞り込み・並べ替えは画面で行う（conventions.md 5章）。
 */
export async function listExecutions(): Promise<ExecutionSummary[]> {
  const rows = await summarizeExecutions();
  return rows.map(({ endedAt: _, ...summary }) => summary);
}

/**
 * 実行の一覧の行を、条件に合う実行について作る（S-11、ホーム）。並びは決めない。
 * 進捗は手順のステップだけを数え、完了数には完了とスキップを数える（D-57）。
 */
export async function summarizeExecutions(where?: SQL): Promise<HomeExecution[]> {
  const progress = db
    .select({
      executionId: executionSteps.executionId,
      total: sql<number>`count(*) filter (where ${executionSteps.section} = 'main')::int`.as(
        "total",
      ),
      done: sql<number>`count(*) filter (where ${executionSteps.section} = 'main' and ${executionSteps.status} in ('done', 'skipped'))::int`.as(
        "done",
      ),
    })
    .from(executionSteps)
    .groupBy(executionSteps.executionId)
    .as("progress");
  const rows = await db
    .select({
      e: executions,
      versionNo: procedureVersions.versionNo,
      title: titleOf(procedureVersions.content),
      done: progress.done,
      total: progress.total,
    })
    .from(executions)
    .innerJoin(procedureVersions, eq(procedureVersions.id, executions.versionId))
    .leftJoin(progress, eq(progress.executionId, executions.id))
    .where(where);
  const name = await userNames(
    db,
    rows.map((r) => r.e.executorId),
  );
  return rows.map(({ e, versionNo, title, done, total }) => ({
    id: e.id,
    procedure: { id: e.procedureId, title },
    versionNo,
    executor: name(e.executorId),
    status: e.status,
    approvalStatus: e.approvalStatus,
    progress: { done: done ?? 0, total: total ?? 0 },
    startedAt: iso(e.startedAt),
    endedAt: e.endedAt ? iso(e.endedAt) : null,
    updatedAt: iso(e.updatedAt),
  }));
}

/** ユーザーが実行者で、実行中の実行（S-15、D-36）。開始の新しい順。 */
export async function runningExecutionsOf(userId: string): Promise<RunningExecution[]> {
  const rows = await db
    .select({
      e: executions,
      versionNo: procedureVersions.versionNo,
      title: titleOf(procedureVersions.content),
    })
    .from(executions)
    .innerJoin(procedureVersions, eq(procedureVersions.id, executions.versionId))
    .where(and(eq(executions.executorId, userId), eq(executions.status, "running")))
    .orderBy(desc(executions.startedAt), desc(executions.id));
  return rows.map(({ e, versionNo, title }) => ({
    id: e.id,
    procedure: { id: e.procedureId, title },
    versionNo,
    startedAt: iso(e.startedAt),
    updatedAt: iso(e.updatedAt),
  }));
}
