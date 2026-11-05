import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, login, PASSWORD, readJson, request, resetDb } from "../../test/helpers.ts";
import { db } from "../db/client.ts";
import { session } from "../db/schema/auth.ts";
import { userRoles } from "../db/schema/users.ts";
import { AppError, problemResponse } from "../lib/errors.ts";
import type { AppEnv } from "../lib/hono.ts";
import { requirePasswordChanged, requireSession } from "./session.ts";

beforeEach(resetDb);

describe("GET /api/me とセッションの確認", () => {
  it("ログインしていなければ 401 UNAUTHENTICATED", async () => {
    const res = await request("/api/me");
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("自分の情報とロールを返す", async () => {
    const id = await createUser({ username: "user01", roles: ["author", "executor"] });
    const cookie = await login("user01");
    const res = await request("/api/me", { cookie });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({
      id,
      name: "user01 さん",
      username: "user01",
      roles: expect.arrayContaining(["author", "executor"]),
      mustChangePassword: false,
    });
    expect(body.roles).toHaveLength(2);
  });

  it("ロールはリクエストのたびに DB から読む（D-35）", async () => {
    const id = await createUser({ username: "user01", roles: ["executor"] });
    const cookie = await login("user01");
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    const body = await readJson(await request("/api/me", { cookie }));
    expect(body.roles).toEqual([]);
  });

  it("期限を延ばしたときの Set-Cookie を応答に移す（D-14 の補足）", async () => {
    const id = await createUser({ username: "user01", roles: ["viewer"] });
    const cookie = await login("user01");
    // updateAge を過ぎたことにする
    await db
      .update(session)
      .set({ updatedAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(session.userId, id));
    const res = await request("/api/me", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toMatch(/better-auth\.session_token=/);
    const [row] = await db.select().from(session).where(eq(session.userId, id));
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });
});

describe("パスワード変更が必要なユーザー（D-14、authorization.md 2章の 2）", () => {
  // パスワード変更済みを求めるルートは、まだ機能がないので小さなアプリで確かめる
  const probe = new Hono<AppEnv>()
    .use(requireSession, requirePasswordChanged)
    .get("/api/probe", (c) => c.json({ ok: true }));
  probe.onError((err) =>
    err instanceof AppError ? problemResponse(err.code) : problemResponse("INTERNAL_ERROR"),
  );
  const callProbe = (cookie: string) => probe.request("/api/probe", { headers: { cookie } });

  it("GET /api/me は呼べ、mustChangePassword が真になっている", async () => {
    await createUser({ username: "user01", roles: ["viewer"], mustChangePassword: true });
    const cookie = await login("user01");
    const res = await request("/api/me", { cookie });
    expect(res.status).toBe(200);
    expect((await readJson(res)).mustChangePassword).toBe(true);
  });

  it("ほかの API は 403 PASSWORD_CHANGE_REQUIRED", async () => {
    await createUser({ username: "user01", roles: ["viewer"], mustChangePassword: true });
    const cookie = await login("user01");
    const res = await callProbe(cookie);
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("自分でパスワードを変更すると、ほかの API も呼べるようになる", async () => {
    await createUser({ username: "user01", roles: ["viewer"], mustChangePassword: true });
    const cookie = await login("user01");
    const changed = await request("/api/auth/change-password", {
      cookie,
      json: { currentPassword: PASSWORD, newPassword: "New-passw0rd-dummy" },
    });
    expect(changed.status).toBe(200);
    const me = await readJson(await request("/api/me", { cookie }));
    expect(me.mustChangePassword).toBe(false);
    expect((await callProbe(cookie)).status).toBe(200);
  });

  it("パスワードの変更に失敗したら、変更が必要なまま", async () => {
    await createUser({ username: "user01", roles: ["viewer"], mustChangePassword: true });
    const cookie = await login("user01");
    const changed = await request("/api/auth/change-password", {
      cookie,
      json: { currentPassword: "wrong-password-xx", newPassword: "New-passw0rd-dummy" },
    });
    expect(changed.status).toBe(400);
    const me = await readJson(await request("/api/me", { cookie }));
    expect(me.mustChangePassword).toBe(true);
  });
});
