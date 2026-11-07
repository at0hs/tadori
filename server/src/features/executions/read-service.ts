import type { ExecutionDetailResponse, StepRecord } from "@tadori/shared";
import { asc, eq } from "drizzle-orm";
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
import { userNames } from "../procedures/queries.ts";
import { executorBlocked } from "./queries.ts";

// 実行の読み込み（api.md 4.4・5.1）。実行は全員が見られる（authorization.md 3.3）。
// 応答に含める情報は api.md 3章（D-49）に従う。他のユーザーは ID と名前だけ。
// 手順書名と文書は、実行の元にした版から取る（data-model.md 4.3）。

const iso = (d: Date) => d.toISOString();

/** 実行の詳細（S-12）。canAdminCancel は管理者にだけ項目ごと返す（D-48）。 */
export async function getExecution(actor: Actor, id: string): Promise<ExecutionDetailResponse> {
  const [row] = await db
    .select({ e: executions, v: procedureVersions })
    .from(executions)
    .innerJoin(procedureVersions, eq(procedureVersions.id, executions.versionId))
    .where(eq(executions.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const { e, v } = row;

  const [variables, steps, events, comments, evidences, approvals] = await Promise.all([
    db.select().from(executionVariables).where(eq(executionVariables.executionId, id)),
    db.select().from(executionSteps).where(eq(executionSteps.executionId, id)),
    db
      .select()
      .from(stepStatusEvents)
      .where(eq(stepStatusEvents.executionId, id))
      .orderBy(asc(stepStatusEvents.changedAt), asc(stepStatusEvents.id)),
    db
      .select()
      .from(stepComments)
      .where(eq(stepComments.executionId, id))
      .orderBy(asc(stepComments.createdAt), asc(stepComments.id)),
    db
      .select()
      .from(stepEvidences)
      .where(eq(stepEvidences.executionId, id))
      .orderBy(asc(stepEvidences.createdAt), asc(stepEvidences.id)),
    db
      .select()
      .from(approvalEvents)
      .where(eq(approvalEvents.executionId, id))
      .orderBy(asc(approvalEvents.occurredAt), asc(approvalEvents.id)),
  ]);

  const name = await userNames(db, [
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
  if (actor.roles.includes("admin")) {
    body.canAdminCancel = e.status === "running" && (await executorBlocked(db, e.executorId));
  }
  return body;
}
