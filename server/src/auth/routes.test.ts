import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureOperationLogs,
  createUser,
  login,
  PASSWORD,
  readJson,
  request,
  resetDb,
} from "../../test/helpers.ts";
import { auth, SIGN_IN_RATE_LIMIT } from "./auth.ts";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Better Auth の入口の許可リスト（D-33）", () => {
  it.each([
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/admin/ban-user"],
    ["POST", "/api/auth/admin/create-user"],
    ["POST", "/api/auth/admin/set-role"],
    ["GET", "/api/auth/admin/list-users"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/update-user"],
    ["GET", "/api/auth/sign-in/username"],
    ["POST", "/api/auth/sign-in/username/"],
  ])("%s %s は 404", async (method, path) => {
    const res = await request(path, { method, json: method === "GET" ? undefined : {} });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect((await readJson(res)).code).toBe("NOT_FOUND");
  });

  it("管理者でも admin プラグインの入口は外から呼べない", async () => {
    await createUser({ username: "admin01", role: "admin" });
    const target = await createUser({ username: "user01", role: "viewer" });
    const cookie = await login("admin01");
    const res = await request("/api/auth/admin/ban-user", { cookie, json: { userId: target } });
    expect(res.status).toBe(404);
  });

  it("ユーザー名でログインでき、セッションの Cookie が返る", async () => {
    await createUser({ username: "user01", role: "viewer" });
    const res = await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/better-auth\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
  });

  it("F-01 AC: 無効化されたユーザーはログインできない", async () => {
    await createUser({ username: "admin01", role: "admin" });
    const id = await createUser({ username: "user01", role: "viewer" });
    const userCookie = await login("user01");
    const adminCookie = await login("admin01");

    // 管理者の操作は、サーバーの中から管理者のセッションで呼ぶ（authorization.md 4.3）
    await auth.api.banUser({ headers: new Headers({ cookie: adminCookie }), body: { userId: id } });

    const res = await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(res.status).toBe(403);
    // 既存のセッションも失効する（D-14）
    expect((await request("/api/me", { cookie: userCookie })).status).toBe(401);
  });

  it("ログアウトするとセッションが使えなくなる", async () => {
    await createUser({ username: "user01", role: "viewer" });
    const cookie = await login("user01");
    expect((await request("/api/me", { cookie })).status).toBe(200);
    expect((await request("/api/auth/sign-out", { cookie, json: {} })).status).toBe(200);
    expect((await request("/api/me", { cookie })).status).toBe(401);
  });
});

describe("ログインの回数制限と IP（D-52、D-60）", () => {
  it("X-Forwarded-For を毎回変えても、接続元ごとに数えられる", async () => {
    await createUser({ username: "user01", role: "viewer" });
    const ip = "198.51.100.7";
    const statuses: number[] = [];
    for (let i = 0; i < SIGN_IN_RATE_LIMIT.max + 2; i++) {
      const res = await request("/api/auth/sign-in/username", {
        ip,
        headers: { "x-forwarded-for": `203.0.113.${i}` },
        json: { username: "user01", password: "wrong-password-xx" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, SIGN_IN_RATE_LIMIT.max).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(SIGN_IN_RATE_LIMIT.max)).toEqual([429, 429]);

    // 別の接続元からは、引き続きログインできる
    const other = await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(other.status).toBe(200);
  });
});

describe("F-10 AC: ログインの成功・失敗がログから追える", () => {
  it("成功：操作した人と接続元の IP を出す", async () => {
    const id = await createUser({ username: "user01" });
    const logs = captureOperationLogs();
    await request("/api/auth/sign-in/username", {
      ip: "198.51.100.20",
      json: { username: "user01", password: PASSWORD },
    });
    expect(logs).toEqual([
      expect.objectContaining({
        event: "auth.login_succeeded",
        actorId: id,
        ip: "198.51.100.20",
        requestId: expect.any(String),
      }),
    ]);
  });

  it("失敗：入力されたユーザー名が存在すればその ID を出し、入力そのものは出さない", async () => {
    const id = await createUser({ username: "user01" });
    const logs = captureOperationLogs();
    await request("/api/auth/sign-in/username", {
      ip: "198.51.100.21",
      json: { username: "USER01", password: "wrong-password-xx" },
    });
    expect(logs).toEqual([
      expect.objectContaining({ event: "auth.login_failed", actorId: id, ip: "198.51.100.21" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain("wrong-password-xx");
    expect(JSON.stringify(logs)).not.toContain("USER01");
  });

  it("失敗：存在しないユーザー名なら actorId を出さない（ユーザー名の欄に入れたパスワードを残さない）", async () => {
    const logs = captureOperationLogs();
    await request("/api/auth/sign-in/username", {
      json: { username: "Secret-typed-here", password: "wrong-password-xx" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "auth.login_failed" });
    expect(logs[0]).not.toHaveProperty("actorId");
    expect(JSON.stringify(logs)).not.toContain("Secret-typed-here");
  });

  it("無効化されたユーザーのログインは失敗として出す", async () => {
    await createUser({ username: "admin01", role: "admin" });
    const id = await createUser({ username: "user01" });
    const adminCookie = await login("admin01");
    await request(`/api/admin/users/${id}/ban`, { cookie: adminCookie, json: {} });
    const logs = captureOperationLogs();
    await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(logs).toEqual([expect.objectContaining({ event: "auth.login_failed", actorId: id })]);
  });
});
