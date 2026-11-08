import type { Role } from "@tadori/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedProcedure, startRun } from "../../../test/executions.ts";
import {
  adminColumnMismatches,
  captureOperationLogs,
  createUser,
  login,
  PASSWORD,
  readJson,
  request,
  resetDb,
} from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const UNKNOWN_ID = "01970000-0000-7000-8000-000000000000";
const TEMP_PASSWORD = "Temp-passw0rd-dummy";

/** 管理者を作ってログインし、その ID と Cookie を返す。 */
async function adminSession(username = "admin01") {
  const id = await createUser({ username, role: "admin" });
  return { id, cookie: await login(username) };
}

async function roleOf(cookie: string, userId: string): Promise<Role> {
  const res = await request(`/api/admin/users/${userId}`, { cookie });
  return (await readJson(res)).user.role;
}

/** PUT /api/admin/users/{id}/role（D-64） */
function setRole(cookie: string, userId: string, role: string) {
  return request(`/api/admin/users/${userId}/role`, { method: "PUT", cookie, json: { role } });
}

const newUserBody = (overrides: Record<string, unknown> = {}) => ({
  name: "新しい 利用者",
  username: "newuser01",
  email: "newuser01@example.test",
  password: TEMP_PASSWORD,
  role: "worker",
  ...overrides,
});

describe("F-01 AC: ロールのない操作は API 上でも拒否される", () => {
  // 管理者の API をすべて並べる。対象のユーザーは beforeEach で作る。
  const endpoints = (target: string) =>
    [
      ["GET", "/api/admin/users", undefined],
      ["GET", `/api/admin/users/${target}`, undefined],
      ["POST", "/api/admin/users", newUserBody()],
      ["PUT", `/api/admin/users/${target}/role`, { role: "admin" }],
      ["POST", `/api/admin/users/${target}/ban`, undefined],
      ["POST", `/api/admin/users/${target}/password-reset`, { password: TEMP_PASSWORD }],
    ] as const;

  it("管理者のすぐ下の承認者でも、管理者の API は FORBIDDEN", async () => {
    const target = await createUser({ username: "target01", role: "viewer" });
    await createUser({ username: "user01", role: "approver" });
    const cookie = await login("user01");

    for (const [method, path, json] of endpoints(target)) {
      const res = await request(path, { method, cookie, json });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect((await readJson(res)).code, `${method} ${path}`).toBe("FORBIDDEN");
    }

    // 何も変わっていない
    const [row] = await db.select().from(user).where(eq(user.id, target));
    expect(row?.banned).toBe(false);
    expect(row?.role).toBe("user");
    const [created] = await db.select().from(user).where(eq(user.username, "newuser01"));
    expect(created).toBeUndefined();
  });

  it("ロールの行がないユーザーも FORBIDDEN", async () => {
    const target = await createUser({ username: "target01" });
    await createUser({ username: "user01", role: null });
    const cookie = await login("user01");
    for (const [method, path, json] of endpoints(target)) {
      const res = await request(path, { method, cookie, json });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("ログインしていなければ UNAUTHENTICATED", async () => {
    const target = await createUser({ username: "target01" });
    for (const [method, path, json] of endpoints(target)) {
      const res = await request(path, { method, json });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("パスワード変更が必要な管理者は PASSWORD_CHANGE_REQUIRED", async () => {
    await createUser({ username: "admin01", role: "admin", mustChangePassword: true });
    const cookie = await login("admin01");
    const res = await request("/api/admin/users", { cookie });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("管理者を作業者に下げると、次のリクエストから拒否され、user.role も食い違わない（D-35、D-33）", async () => {
    const admin = await adminSession("admin01");
    const other = await adminSession("admin02");
    expect((await request("/api/admin/users", { cookie: other.cookie })).status).toBe(200);

    const res = await setRole(admin.cookie, other.id, "worker");
    expect(res.status).toBe(204);
    expect((await request("/api/admin/users", { cookie: other.cookie })).status).toBe(403);
    expect(await adminColumnMismatches()).toEqual([]);
  });
});

describe("ユーザーの一覧・詳細（S-13、S-15）", () => {
  it("一覧に、名前・ユーザー名・メールアドレス・ロール・有効かどうか・パスワード変更が必要かが出る", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "worker", mustChangePassword: true });
    const noRow = await createUser({ username: "user02", role: null });

    const res = await request("/api/admin/users", { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const { users } = await readJson(res);
    expect(users).toHaveLength(3);
    const found = users.find((u: { id: string }) => u.id === id);
    expect(found).toEqual({
      id,
      name: "user01 さん",
      username: "user01",
      email: "user01@example.test",
      role: "worker",
      banned: false,
      mustChangePassword: true,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
    // 行のないユーザーは閲覧者として出す（authorization.md 1章）
    expect(users.find((u: { id: string }) => u.id === noRow).role).toBe("viewer");
  });

  it("詳細を返す。いないユーザーと、UUID でない ID は NOT_FOUND", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "approver" });

    const res = await request(`/api/admin/users/${id}`, { cookie: admin.cookie });
    expect(res.status).toBe(200);
    expect((await readJson(res)).user).toMatchObject({ id, username: "user01", role: "approver" });

    for (const bad of [UNKNOWN_ID, "not-a-uuid"]) {
      const r = await request(`/api/admin/users/${bad}`, { cookie: admin.cookie });
      expect(r.status).toBe(404);
      expect((await readJson(r)).code).toBe("NOT_FOUND");
    }
  });
  it("S-15: ユーザーの詳細に、そのユーザーの実行中の実行が出る", async () => {
    const admin = await adminSession();
    const authorId = await createUser({ username: "author01", role: "worker" });
    const execId = await createUser({ username: "exec01", role: "worker" });
    await createUser({ username: "exec02", role: "worker" });
    const procedureId = await publishedProcedure(authorId);
    const mine = await login("exec01");
    const running = await startRun(mine, procedureId);
    const ended = await startRun(mine, procedureId);
    await request(`/api/executions/${ended}/cancel`, { cookie: mine, json: { reason: "" } });
    await startRun(await login("exec02"), procedureId);

    const res = await request(`/api/admin/users/${execId}`, { cookie: admin.cookie });
    const body = await readJson(res);
    expect(body.runningExecutions).toEqual([
      {
        id: running,
        procedure: { id: procedureId, title: "nginx の設定変更" },
        versionNo: 1,
        startedAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);

    const none = await readJson(
      await request(`/api/admin/users/${authorId}`, { cookie: admin.cookie }),
    );
    expect(none.runningExecutions).toEqual([]);
  });
});

describe("ユーザーの作成（S-14）", () => {
  it("作成したユーザーは仮のパスワードでログインでき、パスワード変更が必要になる", async () => {
    const admin = await adminSession();
    const logs = captureOperationLogs();

    const res = await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ role: "approver" }),
    });
    expect(res.status).toBe(201);
    const { id } = await readJson(res);

    const cookie = await login("newuser01", TEMP_PASSWORD);
    const me = await readJson(await request("/api/me", { cookie }));
    expect(me).toMatchObject({
      id,
      name: "新しい 利用者",
      username: "newuser01",
      role: "approver",
      mustChangePassword: true,
    });
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    expect(rows).toEqual([expect.objectContaining({ role: "approver", updatedBy: admin.id })]);

    expect(logs.filter((l) => l.event === "user.created")).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        target: { type: "user", id },
        role: "approver",
      }),
    ]);
    // 仮のパスワードはログに出さない（F-10 AC）
    expect(JSON.stringify(logs)).not.toContain(TEMP_PASSWORD);
  });

  it("ロールは1つ必須。ない・古い形（配列）・知らない値は VALIDATION_FAILED", async () => {
    const admin = await adminSession();
    const { role: _, ...withoutRole } = newUserBody();
    const missing = await request("/api/admin/users", { cookie: admin.cookie, json: withoutRole });
    expect(missing.status).toBe(400);
    expect((await readJson(missing)).errors).toEqual([
      { path: "role", message: "ロールを選んでください。" },
    ]);

    for (const bad of [{ roles: ["worker"] }, { role: "author" }, { role: ["worker"] }]) {
      const res = await request("/api/admin/users", {
        cookie: admin.cookie,
        json: { ...withoutRole, ...bad },
      });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const [created] = await db.select().from(user).where(eq(user.username, "newuser01"));
    expect(created).toBeUndefined();
  });

  it("D-33: 管理者で作ると user.role が admin、それ以外なら user になる", async () => {
    const admin = await adminSession();
    await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ username: "newadmin", email: "newadmin@example.test", role: "admin" }),
    });
    await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ role: "approver" }),
    });

    const rows = await db.select({ username: user.username, role: user.role }).from(user);
    expect(rows).toEqual(
      expect.arrayContaining([
        { username: "newadmin", role: "admin" },
        { username: "newuser01", role: "user" },
      ]),
    );
    expect(await adminColumnMismatches()).toEqual([]);
  });

  it("使われているユーザー名（大文字・小文字の違いだけのものを含む）とメールアドレスは VALIDATION_FAILED", async () => {
    const admin = await adminSession();
    await createUser({ username: "user01" });

    const dupName = await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ username: "User01" }),
    });
    expect(dupName.status).toBe(400);
    expect(await readJson(dupName)).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "username" }],
    });

    const dupEmail = await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ email: "USER01@example.test" }),
    });
    expect(dupEmail.status).toBe(400);
    expect(await readJson(dupEmail)).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "email" }],
    });
  });

  it("入力の誤りは、欄ごとの errors を付けて VALIDATION_FAILED", async () => {
    const admin = await adminSession();
    const res = await request("/api/admin/users", {
      cookie: admin.cookie,
      json: {
        name: " ",
        username: "ab",
        email: "not-an-email",
        password: "short",
        role: "superuser",
      },
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe("VALIDATION_FAILED");
    const paths = body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(["name", "username", "email", "password", "role"]),
    );
  });

  it("JSON でなければ UNSUPPORTED_MEDIA_TYPE、壊れた JSON は VALIDATION_FAILED", async () => {
    const admin = await adminSession();
    const text = await request("/api/admin/users", {
      method: "POST",
      cookie: admin.cookie,
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(newUserBody()),
    });
    expect(text.status).toBe(415);
    expect((await readJson(text)).code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const broken = await request("/api/admin/users", {
      method: "POST",
      cookie: admin.cookie,
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(broken.status).toBe(400);
    expect((await readJson(broken)).code).toBe("VALIDATION_FAILED");
  });
});

describe("ロールの変更（D-64）", () => {
  it("変更でき、同じロールなら何もせずに成功する。操作ログは変わったときだけ、変更前と変更後を付けて出す", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "worker" });
    const logs = captureOperationLogs();

    expect((await setRole(admin.cookie, id, "approver")).status).toBe(204);
    expect((await setRole(admin.cookie, id, "approver")).status).toBe(204);
    expect(await roleOf(admin.cookie, id)).toBe("approver");
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    expect(rows).toEqual([expect.objectContaining({ role: "approver", updatedBy: admin.id })]);

    expect(logs.map((l) => [l.event, l.actorId, l.target, l.from, l.to])).toEqual([
      ["user.role_changed", admin.id, { type: "user", id }, "worker", "approver"],
    ]);
  });

  it("行のないユーザーを閲覧者にすると行ができ、実効のロールは変わらないのでログは出さない", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: null });
    const logs = captureOperationLogs();

    expect((await setRole(admin.cookie, id, "viewer")).status).toBe(204);
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    expect(rows).toEqual([expect.objectContaining({ role: "viewer", updatedBy: admin.id })]);
    expect(logs).toEqual([]);

    const other = await createUser({ username: "user02", role: null });
    expect((await setRole(admin.cookie, other, "worker")).status).toBe(204);
    expect(logs.map((l) => [l.event, l.from, l.to])).toEqual([
      ["user.role_changed", "viewer", "worker"],
    ]);
  });

  it("変更したロールはすぐに効く（D-35）", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    const cookie = await login("user01");
    expect((await request("/api/admin/users", { cookie })).status).toBe(403);

    await setRole(admin.cookie, id, "admin");
    expect((await request("/api/admin/users", { cookie })).status).toBe(200);
  });

  it("D-33: 管理者へ・管理者からの変更で、user_roles と user.role が食い違わない", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "worker" });
    const roleColumn = async () =>
      (await db.select({ role: user.role }).from(user).where(eq(user.id, id)))[0]?.role;

    await setRole(admin.cookie, id, "admin");
    expect(await roleColumn()).toBe("admin");
    expect(await adminColumnMismatches()).toEqual([]);

    await setRole(admin.cookie, id, "approver");
    expect(await roleColumn()).toBe("user");
    expect(await adminColumnMismatches()).toEqual([]);
  });

  it("D-38: 自分のロールは、同じロールでも変更できない。他の管理者のロールは変更できる", async () => {
    const admin = await adminSession();
    const other = await createUser({ username: "admin02", role: "admin" });

    for (const role of ["approver", "admin"]) {
      const self = await setRole(admin.cookie, admin.id, role);
      expect(self.status, role).toBe(403);
      expect(await readJson(self)).toMatchObject({
        code: "FORBIDDEN",
        detail: "自分のロールは変更できません。",
      });
    }
    expect(await roleOf(admin.cookie, admin.id)).toBe("admin");

    expect((await setRole(admin.cookie, other, "viewer")).status).toBe(204);
    expect(await roleOf(admin.cookie, other)).toBe("viewer");
  });

  it("いないユーザーは NOT_FOUND、知らないロールは VALIDATION_FAILED、古いパスは NOT_FOUND", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    expect((await setRole(admin.cookie, UNKNOWN_ID, "viewer")).status).toBe(404);

    const unknownRole = await setRole(admin.cookie, id, "author");
    expect(unknownRole.status).toBe(400);
    expect((await readJson(unknownRole)).code).toBe("VALIDATION_FAILED");

    const old = await request(`/api/admin/users/${id}/roles/approver`, {
      method: "PUT",
      cookie: admin.cookie,
    });
    expect(old.status).toBe(404);
  });
});

describe("無効化", () => {
  it("F-01 AC: 無効化したユーザーはログインできず、既存のセッションも失効する", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "viewer" });
    const userCookie = await login("user01");
    const logs = captureOperationLogs();

    const res = await request(`/api/admin/users/${id}/ban`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(res.status).toBe(204);

    expect((await request("/api/me", { cookie: userCookie })).status).toBe(401);
    const signIn = await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(signIn.status).toBe(403);
    expect((await request(`/api/admin/users/${id}`, { cookie: admin.cookie })).status).toBe(200);
    expect(
      (await readJson(await request(`/api/admin/users/${id}`, { cookie: admin.cookie }))).user
        .banned,
    ).toBe(true);

    expect(logs.filter((l) => l.event === "user.banned")).toEqual([
      expect.objectContaining({ actorId: admin.id, target: { type: "user", id } }),
    ]);
  });

  it("すでに無効なら何もせずに成功し、操作ログは出さない", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    await request(`/api/admin/users/${id}/ban`, { method: "POST", cookie: admin.cookie });
    const logs = captureOperationLogs();
    const res = await request(`/api/admin/users/${id}/ban`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(res.status).toBe(204);
    expect(logs).toEqual([]);
  });

  it("D-38: 自分自身は無効化できない", async () => {
    const admin = await adminSession();
    const res = await request(`/api/admin/users/${admin.id}/ban`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("FORBIDDEN");
    expect((await request("/api/admin/users", { cookie: admin.cookie })).status).toBe(200);
  });

  it("いないユーザーは NOT_FOUND", async () => {
    const admin = await adminSession();
    const res = await request(`/api/admin/users/${UNKNOWN_ID}/ban`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(res.status).toBe(404);
  });
});

describe("パスワードの再設定（D-37）", () => {
  it("仮のパスワードにし、既存のセッションを失効させ、次のログインでパスワード変更を求める", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", role: "viewer" });
    const oldCookie = await login("user01");
    const logs = captureOperationLogs();

    const res = await request(`/api/admin/users/${id}/password-reset`, {
      cookie: admin.cookie,
      json: { password: TEMP_PASSWORD },
    });
    expect(res.status).toBe(204);

    expect((await request("/api/me", { cookie: oldCookie })).status).toBe(401);
    const oldPassword = await request("/api/auth/sign-in/username", {
      json: { username: "user01", password: PASSWORD },
    });
    expect(oldPassword.status).toBe(401);

    const cookie = await login("user01", TEMP_PASSWORD);
    expect((await readJson(await request("/api/me", { cookie }))).mustChangePassword).toBe(true);

    expect(logs.filter((l) => l.event === "user.password_reset")).toEqual([
      expect.objectContaining({ actorId: admin.id, target: { type: "user", id } }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(TEMP_PASSWORD);
  });

  it("自分自身には使えない", async () => {
    const admin = await adminSession();
    const res = await request(`/api/admin/users/${admin.id}/password-reset`, {
      cookie: admin.cookie,
      json: { password: TEMP_PASSWORD },
    });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("FORBIDDEN");
    // パスワードも「パスワード変更が必要」も変わっていない
    expect((await request("/api/admin/users", { cookie: admin.cookie })).status).toBe(200);
    await login("admin01");
  });

  it("短すぎるパスワードは VALIDATION_FAILED", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    const res = await request(`/api/admin/users/${id}/password-reset`, {
      cookie: admin.cookie,
      json: { password: "short" },
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).errors).toEqual([expect.objectContaining({ path: "password" })]);
  });
});
