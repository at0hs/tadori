import {
  type AdminUserDetailResponse,
  type AdminUserListResponse,
  type CreateUserResponse,
  createUserRequestSchema,
  passwordResetRequestSchema,
  userIdParamSchema,
  userRoleParamSchema,
} from "@tadori/shared";
import { Hono } from "hono";
import { type AppEnv, operatorOf } from "../../lib/hono.ts";
import { jsonBody, pathParams } from "../../lib/validate.ts";
import { requireRole } from "../../middleware/role.ts";
import { runningExecutionsOf } from "../executions/read-service.ts";
import {
  banUser,
  createUser,
  getUser,
  grantRole,
  listUsers,
  resetPassword,
  revokeRole,
} from "./service.ts";

// 管理者の API（api.md 4.6）。すべて管理者ロールが必要（authorization.md 3.1）。
export const adminUserRoutes = new Hono<AppEnv>()
  .use(requireRole("admin"))
  .get("/", async (c) => {
    const body: AdminUserListResponse = { users: await listUsers() };
    return c.json(body);
  })
  .post("/", jsonBody(createUserRequestSchema), async (c) => {
    const body: CreateUserResponse = await createUser(operatorOf(c), c.req.valid("json"));
    return c.json(body, 201);
  })
  .get("/:id", pathParams(userIdParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const body: AdminUserDetailResponse = {
      user: await getUser(id),
      runningExecutions: await runningExecutionsOf(id),
    };
    return c.json(body);
  })
  .put("/:id/roles/:role", pathParams(userRoleParamSchema), async (c) => {
    const { id, role } = c.req.valid("param");
    await grantRole(operatorOf(c), id, role);
    return c.body(null, 204);
  })
  .delete("/:id/roles/:role", pathParams(userRoleParamSchema), async (c) => {
    const { id, role } = c.req.valid("param");
    await revokeRole(operatorOf(c), id, role);
    return c.body(null, 204);
  })
  .post("/:id/ban", pathParams(userIdParamSchema), async (c) => {
    await banUser(operatorOf(c), c.req.valid("param").id);
    return c.body(null, 204);
  })
  .post(
    "/:id/password-reset",
    pathParams(userIdParamSchema),
    jsonBody(passwordResetRequestSchema),
    async (c) => {
      await resetPassword(operatorOf(c), c.req.valid("param").id, c.req.valid("json").password);
      return c.body(null, 204);
    },
  );
