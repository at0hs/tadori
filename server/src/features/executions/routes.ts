import {
  cancelRequestSchema,
  commentRequestSchema,
  type ExecutionDetailResponse,
  type ExecutionListResponse,
  evidenceRequestSchema,
  executionIdParamSchema,
  type FinishExecutionResponse,
  type StartExecutionResponse,
  startExecutionRequestSchema,
  stepParamSchema,
  stepStatusChangeRequestSchema,
  updateVariablesRequestSchema,
} from "@tadori/shared";
import { Hono } from "hono";
import { type AppEnv, operatorOf } from "../../lib/hono.ts";
import { jsonBody, pathParams } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/role.ts";
import { cancelExecution, finishExecution } from "./end-service.ts";
import { contentDisposition } from "./export-format.ts";
import { exportExecution } from "./export-service.ts";
import { getExecution, listExecutions } from "./read-service.ts";
import { addComment, addEvidence, changeStepStatus, updateVariables } from "./record-service.ts";
import { startExecution } from "./start-service.ts";

// 実行の API（api.md 4.4、authorization.md 3.3）。
// 閲覧は全員。開始と記録は実行者ロール、本人かどうかはサービスで確かめる（D-35）。
export const executionRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: ExecutionListResponse = { executions: await listExecutions() };
    return c.json(body);
  })
  .get("/:id", pathParams(executionIdParamSchema), async (c) => {
    const body: ExecutionDetailResponse = await getExecution(
      c.get("actor"),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  // Excel 出力（F-09）。全員ができる（authorization.md）。
  .get("/:id/export", pathParams(executionIdParamSchema), async (c) => {
    const { body, names } = await exportExecution(operatorOf(c), c.req.valid("param").id);
    return c.body(body, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(names),
      "Cache-Control": "no-store",
    });
  })
  .post("/", requirePermission("execute"), jsonBody(startExecutionRequestSchema), async (c) => {
    const body: StartExecutionResponse = await startExecution(operatorOf(c), c.req.valid("json"));
    return c.json(body, 201);
  })
  .put(
    "/:id/variables",
    requirePermission("execute"),
    pathParams(executionIdParamSchema),
    jsonBody(updateVariablesRequestSchema),
    async (c) => {
      await updateVariables(operatorOf(c), c.req.valid("param").id, c.req.valid("json").variables);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/steps/:stepId/status-changes",
    requirePermission("execute"),
    pathParams(stepParamSchema),
    jsonBody(stepStatusChangeRequestSchema),
    async (c) => {
      const { id, stepId } = c.req.valid("param");
      await changeStepStatus(operatorOf(c), id, stepId, c.req.valid("json"));
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/steps/:stepId/comments",
    requirePermission("execute"),
    pathParams(stepParamSchema),
    jsonBody(commentRequestSchema),
    async (c) => {
      const { id, stepId } = c.req.valid("param");
      await addComment(operatorOf(c), id, stepId, c.req.valid("json").body);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/steps/:stepId/evidences",
    requirePermission("execute"),
    pathParams(stepParamSchema),
    jsonBody(evidenceRequestSchema),
    async (c) => {
      const { id, stepId } = c.req.valid("param");
      await addEvidence(operatorOf(c), id, stepId, c.req.valid("json").body);
      return c.body(null, 204);
    },
  )
  .post("/:id/finish", requirePermission("execute"), pathParams(executionIdParamSchema), async (c) => {
    const body: FinishExecutionResponse = await finishExecution(
      operatorOf(c),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  .post(
    "/:id/cancel",
    requirePermission("execute"),
    pathParams(executionIdParamSchema),
    jsonBody(cancelRequestSchema),
    async (c) => {
      await cancelExecution(operatorOf(c), c.req.valid("param").id, c.req.valid("json").reason);
      return c.body(null, 204);
    },
  );
