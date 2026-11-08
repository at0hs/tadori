import { z } from "zod";
import { executionSummarySchema } from "./executions.ts";
import { userRefSchema } from "./procedures.ts";
import { roleSchema } from "./roles.ts";

// GET /api/me の応答（api.md）
export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string(),
  role: roleSchema,
  mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** ホームの実行の行。S-11 の行に終了日時を足したもの */
export const homeExecutionSchema = executionSummarySchema.extend({
  endedAt: z.iso.datetime().nullable(),
});
export type HomeExecution = z.infer<typeof homeExecutionSchema>;

/** ホームの編集中の手順書の行（下書きのある手順書） */
export const homeDraftSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(["editing", "unpublished"]),
  updatedBy: userRefSchema,
  updatedAt: z.iso.datetime(),
});
export type HomeDraft = z.infer<typeof homeDraftSchema>;

// GET /api/me/home の応答（api.md 4.2）。自分のロールで見られる区画だけをキーごと返す（D-40）
export const meHomeResponseSchema = z.object({
  myExecutions: z.array(homeExecutionSchema).optional(),
  pendingApprovals: z.array(homeExecutionSchema).optional(),
  drafts: z.array(homeDraftSchema).optional(),
});
export type MeHomeResponse = z.infer<typeof meHomeResponseSchema>;
