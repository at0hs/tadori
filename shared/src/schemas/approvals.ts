import { z } from "zod";

// 承認（F-08、api.md 4.5）

/** POST /api/executions/{id}/reject・/resubmit の本文。コメントは必須（F-08、D-31）。 */
export const approvalCommentRequestSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, "コメントを入力してください。")
    .max(5000, "コメントは5000文字以内にしてください。"),
});
export type ApprovalCommentRequest = z.infer<typeof approvalCommentRequestSchema>;
