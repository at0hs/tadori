import { Hono } from "hono";
import { config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";
import { auth } from "./auth.ts";
import { rewriteForwardedFor, socketAddress } from "./client-ip.ts";

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

  const headers = new Headers(c.req.raw.headers);
  const forwardedFor = rewriteForwardedFor(
    headers.get("x-forwarded-for"),
    socketAddress(c),
    config.TRUSTED_PROXIES.length > 0,
  );
  if (forwardedFor === null) headers.delete("x-forwarded-for");
  else headers.set("x-forwarded-for", forwardedFor);

  return auth.handler(new Request(c.req.raw, { headers }));
});
