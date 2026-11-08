import { approvalCommentRequestSchema, executionIdParamSchema } from "@tadori/shared";
import { Hono } from "hono";
import { type AppEnv, operatorOf } from "../../lib/hono.ts";
import { jsonBody, pathParams } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/role.ts";
import { approveExecution, rejectExecution, resubmitExecution } from "./service.ts";

// 承認の API（api.md 4.5、authorization.md 3.4）。/api/executions の下に載せる。
// 承認・差し戻しは承認者ロール、再依頼は実行者ロール。職務分離と本人の確認はサービスで行う。
export const approvalRoutes = new Hono<AppEnv>()
  .post("/:id/approve", requirePermission("approve"), pathParams(executionIdParamSchema), async (c) => {
    await approveExecution(operatorOf(c), c.req.valid("param").id);
    return c.body(null, 204);
  })
  .post(
    "/:id/reject",
    requirePermission("approve"),
    pathParams(executionIdParamSchema),
    jsonBody(approvalCommentRequestSchema),
    async (c) => {
      await rejectExecution(operatorOf(c), c.req.valid("param").id, c.req.valid("json").comment);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/resubmit",
    requirePermission("execute"),
    pathParams(executionIdParamSchema),
    jsonBody(approvalCommentRequestSchema),
    async (c) => {
      await resubmitExecution(operatorOf(c), c.req.valid("param").id, c.req.valid("json").comment);
      return c.body(null, 204);
    },
  );
