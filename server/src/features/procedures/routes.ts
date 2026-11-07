import {
  type DraftResponse,
  type ProcedureDetailResponse,
  type ProcedureListResponse,
  type ProcedureVersionListResponse,
  type ProcedureVersionResponse,
  procedureIdParamSchema,
  versionParamSchema,
} from "@tadori/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/hono.ts";
import { pathParams } from "../../lib/validate.ts";
import { requireRole } from "../../middleware/role.ts";
import {
  getDraft,
  getProcedure,
  getVersion,
  listProcedures,
  listVersions,
} from "./read-service.ts";

// 手順書・版・下書きの API（api.md 4.3、authorization.md 3.2）。
// 閲覧は全員、下書きと状態を変える操作は作成者ロールが必要。
export const procedureRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: ProcedureListResponse = { procedures: await listProcedures(c.get("actor")) };
    return c.json(body);
  })
  .get("/:id", pathParams(procedureIdParamSchema), async (c) => {
    const body: ProcedureDetailResponse = await getProcedure(
      c.get("actor"),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  .get("/:id/versions", pathParams(procedureIdParamSchema), async (c) => {
    const body: ProcedureVersionListResponse = await listVersions(
      c.get("actor"),
      c.req.valid("param").id,
    );
    return c.json(body);
  })
  .get("/:id/versions/:versionNo", pathParams(versionParamSchema), async (c) => {
    const { id, versionNo } = c.req.valid("param");
    const body: ProcedureVersionResponse = await getVersion(c.get("actor"), id, versionNo);
    return c.json(body);
  })
  .get("/:id/draft", requireRole("author"), pathParams(procedureIdParamSchema), async (c) => {
    const body: DraftResponse = await getDraft(c.get("actor"), c.req.valid("param").id);
    return c.json(body);
  });
