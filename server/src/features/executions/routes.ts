import {
  type ExecutionDetailResponse,
  executionIdParamSchema,
  type StartExecutionResponse,
  startExecutionRequestSchema,
} from "@tadori/shared";
import { Hono } from "hono";
import { type AppEnv, operatorOf } from "../../lib/hono.ts";
import { jsonBody, pathParams } from "../../lib/validate.ts";
import { requireRole } from "../../middleware/role.ts";
import { getExecution } from "./read-service.ts";
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
  });
