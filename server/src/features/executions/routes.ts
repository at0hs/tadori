import {
  cancelRequestSchema,
  commentRequestSchema,
  type ExecutionDetailResponse,
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
import { requireRole } from "../../middleware/role.ts";
import { cancelExecution, finishExecution } from "./end-service.ts";
import { getExecution } from "./read-service.ts";
import { addComment, addEvidence, changeStepStatus, updateVariables } from "./record-service.ts";
import { startExecution } from "./start-service.ts";

// 実行の API（api.md 4.4、authorization.md 3.3）。
// 閲覧は全員。開始と記録は実行者ロール、本人かどうかはサービスで確かめる（D-35）。
export const executionRoutes = new Hono<AppEnv>()
  .get("/:id", pathParams(executionIdParamSchema), async (c) => {
    const body: ExecutionDetailResponse = await getExecution(
      c.get("actor"),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  .post("/", requireRole("executor"), jsonBody(startExecutionRequestSchema), async (c) => {
    const body: StartExecutionResponse = await startExecution(operatorOf(c), c.req.valid("json"));
    return c.json(body, 201);
  })
  .put(
    "/:id/variables",
    requireRole("executor"),
    pathParams(executionIdParamSchema),
    jsonBody(updateVariablesRequestSchema),
    async (c) => {
      await updateVariables(operatorOf(c), c.req.valid("param").id, c.req.valid("json").variables);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/steps/:stepId/status-changes",
    requireRole("executor"),
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
    requireRole("executor"),
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
    requireRole("executor"),
    pathParams(stepParamSchema),
    jsonBody(evidenceRequestSchema),
    async (c) => {
      const { id, stepId } = c.req.valid("param");
      await addEvidence(operatorOf(c), id, stepId, c.req.valid("json").body);
      return c.body(null, 204);
    },
  )
  .post("/:id/finish", requireRole("executor"), pathParams(executionIdParamSchema), async (c) => {
    const body: FinishExecutionResponse = await finishExecution(
      operatorOf(c),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  .post(
    "/:id/cancel",
    requireRole("executor", "admin"),
    pathParams(executionIdParamSchema),
    jsonBody(cancelRequestSchema),
    async (c) => {
      await cancelExecution(operatorOf(c), c.req.valid("param").id, c.req.valid("json").reason);
      return c.body(null, 204);
    },
  );
