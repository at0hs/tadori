import { Hono } from "hono";
import { AppError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";
import { auth } from "./auth.ts";

// Better Auth の HTTP の入口は、許可するものだけを通す（D-33、authorization.md 4.1、api.md）。
// Better Auth が版を上げて入口を増やしても、ここに書かない限り外に出ない。
const ALLOWED = new Set([
  "POST /sign-in/username",
  "POST /sign-out",
  "GET /get-session",
  "POST /change-password",
]);

export const authRoutes = new Hono<AppEnv>().all("/*", async (c) => {
  const path = c.req.path.slice("/api/auth".length);
  if (!ALLOWED.has(`${c.req.method} ${path}`)) {
    throw new AppError("NOT_FOUND");
  }
  // X-Forwarded-For を付け直し、リクエスト ID を載せたヘッダで渡す（middleware/request-context.ts）
  return auth.handler(new Request(c.req.raw, { headers: c.get("authHeaders") }));
});
