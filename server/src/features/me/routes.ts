import type { MeResponse } from "@tadori/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/hono.ts";
import { requirePasswordChanged } from "../../middleware/session.ts";
import { getHome } from "./home-service.ts";

// GET /api/me は、パスワード変更が必要な人も呼べる（api.md、authorization.md 2章の 2）。
// この経路は app.ts の関門より前に付くので、ほかの経路には関門を個別に付ける。
export const meRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    const actor = c.get("actor");
    const body: MeResponse = {
      id: actor.id,
      name: actor.name,
      username: actor.username,
      roles: actor.roles,
      mustChangePassword: actor.mustChangePassword,
    };
    return c.json(body);
  })
  .get("/home", requirePasswordChanged, async (c) => c.json(await getHome(c.get("actor"))));
