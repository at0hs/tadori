import { can, type ExecutionDetailResponse, type MeResponse } from "@tadori/shared";

/**
 * S-12 の見出しに出す承認の操作（ui.md 8.4、authorization.md 3.4）。
 * - review：承認待ちで、承認者以上のロールで、実行者でない人（職務分離）。「差し戻す」「承認する」
 * - resubmit：差し戻しで、本人（作業者以上のロール、D-35）。「再依頼する」
 */
export function approvalAction(
  detail: Pick<ExecutionDetailResponse, "executor" | "approvalStatus">,
  me: Pick<MeResponse, "id" | "role">,
): "review" | "resubmit" | null {
  const self = detail.executor.id === me.id;
  if (detail.approvalStatus === "pending" && !self && can(me.role, "approve")) {
    return "review";
  }
  if (detail.approvalStatus === "rejected" && self && can(me.role, "execute")) {
    return "resubmit";
  }
  return null;
}
