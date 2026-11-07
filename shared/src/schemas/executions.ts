import { z } from "zod";
import { procedureContentSchema, userRefSchema, variableNameSchema } from "./procedures.ts";

// 実行・ステップの記録（F-04〜F-07、api.md 4.4・5.1）。
// 長さの上限は api.md 6章で実装に回したもの。

// ===== 状態の値（D-27） =====

export const EXECUTION_STATUSES = ["running", "completed", "abnormal", "cancelled"] as const;
export const executionStatusSchema = z.enum(EXECUTION_STATUSES);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

export const STEP_STATUSES = ["pending", "done", "skipped", "failed"] as const;
export const stepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const STEP_SECTIONS = ["main", "rollback"] as const;
export const stepSectionSchema = z.enum(STEP_SECTIONS);
export type StepSection = z.infer<typeof stepSectionSchema>;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const APPROVAL_EVENT_KINDS = ["requested", "approved", "rejected"] as const;
export const approvalEventKindSchema = z.enum(APPROVAL_EVENT_KINDS);
export type ApprovalEventKind = z.infer<typeof approvalEventKindSchema>;

// ===== 終了の判定と進捗 =====

type StepState = { section: StepSection; status: StepStatus };

/**
 * 「終了する」の結果（state-transitions.md 3.3、要件 4.1）。
 * 1. 手順に失敗がある、または切り戻しを実施した（完了か失敗）→ 異常終了
 * 2. 手順がすべて完了かスキップ → 完了
 * 3. どちらでもない → 終了できない（null）
 */
export function finishOutcome(steps: readonly StepState[]): "completed" | "abnormal" | null {
  const main = steps.filter((s) => s.section === "main");
  const rollback = steps.filter((s) => s.section === "rollback");
  if (
    main.some((s) => s.status === "failed") ||
    rollback.some((s) => s.status === "done" || s.status === "failed")
  ) {
    return "abnormal";
  }
  if (main.every((s) => s.status === "done" || s.status === "skipped")) return "completed";
  return null;
}

/** 進捗。手順のステップだけを数え、完了数には完了とスキップを数える（D-57）。 */
export function progressOf(steps: readonly StepState[]): { done: number; total: number } {
  const main = steps.filter((s) => s.section === "main");
  return {
    done: main.filter((s) => s.status === "done" || s.status === "skipped").length,
    total: main.length,
  };
}

// ===== API の約束事（api.md 4.4） =====

/** 秘密でない変数の値。秘密変数の値は送らない（D-01。名前が来たらサーバーで弾く）。 */
export const variableValuesSchema = z.record(
  variableNameSchema,
  z.string().min(1, "値を入力してください。").max(1000, "値は1000文字以内にしてください。"),
);
export type VariableValues = z.infer<typeof variableValuesSchema>;

/** POST /api/executions */
export const startExecutionRequestSchema = z.object({
  procedureId: z.uuid(),
  versionNo: z.number().int().positive(),
  variables: variableValuesSchema,
});
export type StartExecutionRequest = z.infer<typeof startExecutionRequestSchema>;
export type StartExecutionResponse = { id: string };

/** PUT /api/executions/{id}/variables */
export const updateVariablesRequestSchema = z.object({ variables: variableValuesSchema });
export type UpdateVariablesRequest = z.infer<typeof updateVariablesRequestSchema>;

/** POST /api/executions/{id}/steps/{stepId}/status-changes。from は画面が見ていた状態（D-46）。 */
export const stepStatusChangeRequestSchema = z
  .object({
    from: stepStatusSchema,
    to: stepStatusSchema,
    skipReason: z
      .string()
      .trim()
      .max(1000, "スキップの理由は1000文字以内にしてください。")
      .nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.from === r.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "今と同じ状態です。" });
    }
    if (r.to === "skipped" && !r.skipReason) {
      ctx.addIssue({
        code: "custom",
        path: ["skipReason"],
        message: "スキップの理由を入力してください。",
      });
    }
  });
export type StepStatusChangeRequest = z.infer<typeof stepStatusChangeRequestSchema>;

/** POST /api/executions/{id}/steps/{stepId}/comments */
export const commentRequestSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください。")
    .max(5000, "コメントは5000文字以内にしてください。"),
});
export type CommentRequest = z.infer<typeof commentRequestSchema>;

/** POST /api/executions/{id}/steps/{stepId}/evidences。コマンドの出力なので前後の空白も残す。 */
export const evidenceRequestSchema = z.object({
  body: z
    .string()
    .max(20000, "エビデンスは20000文字以内にしてください。")
    .refine((s) => s.trim() !== "", "エビデンスを入力してください。"),
});
export type EvidenceRequest = z.infer<typeof evidenceRequestSchema>;

/** POST /api/executions/{id}/cancel。理由は空でよい（管理者の必須はサーバーで確かめる）。 */
export const cancelRequestSchema = z.object({
  reason: z.string().trim().max(1000, "中止の理由は1000文字以内にしてください。"),
});
export type CancelRequest = z.infer<typeof cancelRequestSchema>;

/** POST /api/executions/{id}/finish */
export type FinishExecutionResponse = { status: "completed" | "abnormal" };

/** パスのパラメータ */
export const executionIdParamSchema = z.object({ id: z.uuid() });
export const stepParamSchema = z.object({ id: z.uuid(), stepId: z.uuid() });

// ===== 応答 =====

const procedureRef = z.object({ id: z.uuid(), title: z.string() });

const recordSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdBy: userRefSchema,
  createdAt: z.iso.datetime(),
});
export type StepRecord = z.infer<typeof recordSchema>;

export const stepStatusEventSchema = z.object({
  from: stepStatusSchema,
  to: stepStatusSchema,
  skipReason: z.string().nullable(),
  changedBy: userRefSchema,
  changedAt: z.iso.datetime(),
});
export type StepStatusEvent = z.infer<typeof stepStatusEventSchema>;

export const executionStepSchema = z.object({
  stepId: z.uuid(),
  section: stepSectionSchema,
  status: stepStatusSchema,
  skipReason: z.string().nullable(),
  updatedBy: userRefSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
  comments: z.array(recordSchema),
  evidences: z.array(recordSchema),
  history: z.array(stepStatusEventSchema),
});
export type ExecutionStep = z.infer<typeof executionStepSchema>;

export const approvalEventSchema = z.object({
  kind: approvalEventKindSchema,
  comment: z.string().nullable(),
  actor: userRefSchema,
  occurredAt: z.iso.datetime(),
});
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;

/** GET /api/executions/{id}（api.md 5.1）。canAdminCancel は管理者にだけ返す（D-48）。 */
export const executionDetailResponseSchema = z.object({
  id: z.uuid(),
  procedure: procedureRef,
  versionNo: z.number().int(),
  content: procedureContentSchema,
  executor: userRefSchema,
  status: executionStatusSchema,
  approvalStatus: approvalStatusSchema.nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  cancelledBy: userRefSchema.nullable(),
  cancelReason: z.string().nullable(),
  variables: z.record(z.string(), z.string()),
  variablesLocked: z.boolean(),
  steps: z.array(executionStepSchema),
  approvals: z.array(approvalEventSchema),
  canAdminCancel: z.boolean().optional(),
});
export type ExecutionDetailResponse = z.infer<typeof executionDetailResponseSchema>;

/** GET /api/executions の1行（S-11） */
export const executionSummarySchema = z.object({
  id: z.uuid(),
  procedure: procedureRef,
  versionNo: z.number().int(),
  executor: userRefSchema,
  status: executionStatusSchema,
  approvalStatus: approvalStatusSchema.nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ExecutionSummary = z.infer<typeof executionSummarySchema>;
export const executionListResponseSchema = z.object({
  executions: z.array(executionSummarySchema),
});
export type ExecutionListResponse = z.infer<typeof executionListResponseSchema>;

/** ユーザーの実行中の実行（S-15、D-36） */
export const runningExecutionSchema = z.object({
  id: z.uuid(),
  procedure: procedureRef,
  versionNo: z.number().int(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RunningExecution = z.infer<typeof runningExecutionSchema>;

/**
 * STEP_STATUS_CONFLICT の応答に付ける項目（D-46）。
 * Problem Details の status（HTTP の状態コード）とぶつからないよう、今の状態は currentStatus で返す。
 */
export const stepStatusConflictSchema = z.object({
  stepId: z.uuid(),
  currentStatus: stepStatusSchema,
  updatedBy: userRefSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type StepStatusConflict = z.infer<typeof stepStatusConflictSchema>;
