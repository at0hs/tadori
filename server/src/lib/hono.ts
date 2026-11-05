import type { HttpBindings } from "@hono/node-server";
import type { Role } from "@tadori/shared";

// 操作する人（conventions.md 2.1）。ロールはリクエストのたびに DB から読む（D-35）。
export type Actor = {
  id: string;
  name: string;
  username: string;
  roles: Role[];
  mustChangePassword: boolean;
};

export type AppEnv = {
  Bindings: HttpBindings;
  Variables: { actor: Actor };
};
