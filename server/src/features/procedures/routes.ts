import {
  type CreateProcedureResponse,
  createProcedureRequestSchema,
  type DiscardDraftResponse,
  type DraftResponse,
  discardDraftQuerySchema,
  type ProcedureDetailResponse,
  type ProcedureListResponse,
  type ProcedureVersionListResponse,
  type ProcedureVersionResponse,
  type PublishResponse,
  procedureIdParamSchema,
  publishRequestSchema,
  type SaveDraftResponse,
  saveDraftRequestSchema,
  versionParamSchema,
} from "@tadori/shared";
import { Hono } from "hono";
import { type AppEnv, operatorOf } from "../../lib/hono.ts";
import { jsonBody, pathParams, queryParams } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/role.ts";
import {
  getDraft,
  getProcedure,
  getVersion,
  listProcedures,
  listVersions,
} from "./read-service.ts";
import {
  archiveProcedure,
  createProcedure,
  discardDraft,
  publishDraft,
  saveDraft,
} from "./write-service.ts";

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
  .get("/:id/draft", requirePermission("editProcedure"), pathParams(procedureIdParamSchema), async (c) => {
    const body: DraftResponse = await getDraft(c.get("actor"), c.req.valid("param").id);
    return c.json(body);
  })
  .post("/", requirePermission("editProcedure"), jsonBody(createProcedureRequestSchema), async (c) => {
    const body: CreateProcedureResponse = await createProcedure(
      operatorOf(c),
      c.req.valid("json").content,
    );
    return c.json(body, 201);
  })
  .put(
    "/:id/draft",
    requirePermission("editProcedure"),
    pathParams(procedureIdParamSchema),
    jsonBody(saveDraftRequestSchema),
    async (c) => {
      const { content, lock } = c.req.valid("json");
      const body: SaveDraftResponse = await saveDraft(
        operatorOf(c),
        c.req.valid("param").id,
        content,
        lock,
      );
      return c.json(body);
    },
  )
  .post(
    "/:id/publish",
    requirePermission("publishProcedure"),
    pathParams(procedureIdParamSchema),
    jsonBody(publishRequestSchema),
    async (c) => {
      const { content, lock, changeReason } = c.req.valid("json");
      const body: PublishResponse = await publishDraft(
        operatorOf(c),
        c.req.valid("param").id,
        content,
        lock,
        changeReason,
      );
      return c.json(body);
    },
  )
  .delete(
    "/:id/draft",
    requirePermission("editProcedure"),
    pathParams(procedureIdParamSchema),
    queryParams(discardDraftQuerySchema),
    async (c) => {
      const body: DiscardDraftResponse = await discardDraft(
        operatorOf(c),
        c.req.valid("param").id,
        c.req.valid("query").revision,
      );
      return c.json(body);
    },
  )
  .post("/:id/archive", requirePermission("archiveProcedure"), pathParams(procedureIdParamSchema), async (c) => {
    await archiveProcedure(operatorOf(c), c.req.valid("param").id);
    return c.body(null, 204);
  });
