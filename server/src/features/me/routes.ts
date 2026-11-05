import type { MeResponse } from "@tadori/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/hono.ts";

// パスワード変更が必要な人も呼べる（api.md、authorization.md 2章の 2）。
export const meRoutes = new Hono<AppEnv>().get("/", (c) => {
  const actor = c.get("actor");
  const body: MeResponse = {
    id: actor.id,
    name: actor.name,
    username: actor.username,
    roles: actor.roles,
    mustChangePassword: actor.mustChangePassword,
  };
  return c.json(body);
});
