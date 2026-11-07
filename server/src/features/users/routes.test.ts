import { ROLES, type Role } from "@tadori/shared";
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

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const UNKNOWN_ID = "01970000-0000-7000-8000-000000000000";
const TEMP_PASSWORD = "Temp-passw0rd-dummy";

/** 管理者を作ってログインし、その ID と Cookie を返す。 */
async function adminSession(username = "admin01") {
  const id = await createUser({ username, roles: ["admin"] });
  return { id, cookie: await login(username) };
}

async function rolesOf(cookie: string, userId: string): Promise<Role[]> {
  const res = await request(`/api/admin/users/${userId}`, { cookie });
  return (await readJson(res)).user.roles;
}

const newUserBody = (overrides: Record<string, unknown> = {}) => ({
  name: "新しい 利用者",
  username: "newuser01",
  email: "newuser01@example.test",
  password: TEMP_PASSWORD,
  roles: ["executor"],
  ...overrides,
});

describe("F-01 AC: ロールのない操作は API 上でも拒否される", () => {
  // 管理者の API をすべて並べる。対象のユーザーは beforeEach で作る。
  const endpoints = (target: string) =>
    [
      ["GET", "/api/admin/users", undefined],
      ["GET", `/api/admin/users/${target}`, undefined],
      ["POST", "/api/admin/users", newUserBody()],
      ["PUT", `/api/admin/users/${target}/roles/admin`, undefined],
      ["DELETE", `/api/admin/users/${target}/roles/viewer`, undefined],
      ["POST", `/api/admin/users/${target}/ban`, undefined],
      ["POST", `/api/admin/users/${target}/password-reset`, { password: TEMP_PASSWORD }],
    ] as const;

  it("管理者ロール以外のロールをすべて持っていても、管理者の API は FORBIDDEN", async () => {
    const target = await createUser({ username: "target01", roles: ["viewer"] });
    await createUser({ username: "user01", roles: ROLES.filter((r) => r !== "admin") });
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

  it("ロールのないユーザーも FORBIDDEN", async () => {
    const target = await createUser({ username: "target01" });
    await createUser({ username: "user01" });
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
    await createUser({ username: "admin01", roles: ["admin"], mustChangePassword: true });
    const cookie = await login("admin01");
    const res = await request("/api/admin/users", { cookie });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("管理者ロールを剥奪すると、次のリクエストから拒否される（D-35）", async () => {
    const admin = await adminSession("admin01");
    const other = await adminSession("admin02");
    expect((await request("/api/admin/users", { cookie: other.cookie })).status).toBe(200);

    const res = await request(`/api/admin/users/${other.id}/roles/admin`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(res.status).toBe(204);
    expect((await request("/api/admin/users", { cookie: other.cookie })).status).toBe(403);
  });
});

describe("ユーザーの一覧・詳細（S-13、S-15）", () => {
  it("一覧に、名前・ユーザー名・メールアドレス・ロール・有効かどうか・パスワード変更が必要かが出る", async () => {
    const admin = await adminSession();
    const id = await createUser({
      username: "user01",
      roles: ["viewer", "executor"],
      mustChangePassword: true,
    });

    const res = await request("/api/admin/users", { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const { users } = await readJson(res);
    expect(users).toHaveLength(2);
    const found = users.find((u: { id: string }) => u.id === id);
    expect(found).toEqual({
      id,
      name: "user01 さん",
      username: "user01",
      email: "user01@example.test",
      // ロールは ROLES の順に並べる
      roles: ["executor", "viewer"],
      banned: false,
      mustChangePassword: true,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
  });

  it("詳細を返す。いないユーザーと、UUID でない ID は NOT_FOUND", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", roles: ["author"] });

    const res = await request(`/api/admin/users/${id}`, { cookie: admin.cookie });
    expect(res.status).toBe(200);
    expect((await readJson(res)).user).toMatchObject({ id, username: "user01", roles: ["author"] });

    for (const bad of [UNKNOWN_ID, "not-a-uuid"]) {
      const r = await request(`/api/admin/users/${bad}`, { cookie: admin.cookie });
      expect(r.status).toBe(404);
      expect((await readJson(r)).code).toBe("NOT_FOUND");
    }
  });
  it("S-15: ユーザーの詳細に、そのユーザーの実行中の実行が出る", async () => {
    const admin = await adminSession();
    const authorId = await createUser({ username: "author01", roles: ["author"] });
    const execId = await createUser({ username: "exec01", roles: ["executor"] });
    await createUser({ username: "exec02", roles: ["executor"] });
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
      json: newUserBody({ roles: ["executor", "approver"] }),
    });
    expect(res.status).toBe(201);
    const { id } = await readJson(res);

    const cookie = await login("newuser01", TEMP_PASSWORD);
    const me = await readJson(await request("/api/me", { cookie }));
    expect(me).toMatchObject({
      id,
      name: "新しい 利用者",
      username: "newuser01",
      roles: ["executor", "approver"],
      mustChangePassword: true,
    });

    expect(logs.filter((l) => l.event === "user.created")).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        target: { type: "user", id },
        roles: ["executor", "approver"],
      }),
    ]);
    // 仮のパスワードはログに出さない（F-10 AC）
    expect(JSON.stringify(logs)).not.toContain(TEMP_PASSWORD);
  });

  it("ロールなしでも作成できる", async () => {
    const admin = await adminSession();
    const res = await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ roles: [] }),
    });
    expect(res.status).toBe(201);
    expect(await rolesOf(admin.cookie, (await readJson(res)).id)).toEqual([]);
  });

  it("D-33: 管理者ロールを付けて作ると user.role が admin、付けなければ user になる", async () => {
    const admin = await adminSession();
    await request("/api/admin/users", {
      cookie: admin.cookie,
      json: newUserBody({ username: "newadmin", email: "newadmin@example.test", roles: ["admin"] }),
    });
    await request("/api/admin/users", { cookie: admin.cookie, json: newUserBody() });

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
        roles: ["executor", "executor", "superuser"],
      },
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe("VALIDATION_FAILED");
    const paths = body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(["name", "username", "email", "password", "roles.2"]),
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

describe("ロールの付与・剥奪", () => {
  it("付与・剥奪でき、すでにその状態なら何もせずに成功する。操作ログは変わったときだけ出す", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", roles: ["viewer"] });
    const logs = captureOperationLogs();
    const path = `/api/admin/users/${id}/roles/executor`;

    expect((await request(path, { method: "PUT", cookie: admin.cookie })).status).toBe(204);
    expect((await request(path, { method: "PUT", cookie: admin.cookie })).status).toBe(204);
    expect(await rolesOf(admin.cookie, id)).toEqual(["executor", "viewer"]);

    expect((await request(path, { method: "DELETE", cookie: admin.cookie })).status).toBe(204);
    expect((await request(path, { method: "DELETE", cookie: admin.cookie })).status).toBe(204);
    expect(await rolesOf(admin.cookie, id)).toEqual(["viewer"]);

    expect(logs.map((l) => [l.event, l.actorId, l.target, l.role])).toEqual([
      ["user.role_granted", admin.id, { type: "user", id }, "executor"],
      ["user.role_revoked", admin.id, { type: "user", id }, "executor"],
    ]);
  });

  it("付与したロールはすぐに効く（D-35）", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    const cookie = await login("user01");
    expect((await request("/api/admin/users", { cookie })).status).toBe(403);

    await request(`/api/admin/users/${id}/roles/admin`, { method: "PUT", cookie: admin.cookie });
    expect((await request("/api/admin/users", { cookie })).status).toBe(200);
  });

  it("D-33: 管理者ロールの付与・剥奪で、user_roles と user.role が食い違わない", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", roles: ["viewer"] });
    const roleColumn = async () =>
      (await db.select({ role: user.role }).from(user).where(eq(user.id, id)))[0]?.role;

    await request(`/api/admin/users/${id}/roles/admin`, { method: "PUT", cookie: admin.cookie });
    expect(await roleColumn()).toBe("admin");
    expect(await adminColumnMismatches()).toEqual([]);

    // 管理者以外のロールを変えても、user.role は変わらない
    await request(`/api/admin/users/${id}/roles/viewer`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(await roleColumn()).toBe("admin");

    await request(`/api/admin/users/${id}/roles/admin`, { method: "DELETE", cookie: admin.cookie });
    expect(await roleColumn()).toBe("user");
    expect(await adminColumnMismatches()).toEqual([]);
  });

  it("D-38: 自分の管理者ロールは剥奪できない。自分のほかのロールと、他の管理者の管理者ロールは剥奪できる", async () => {
    const admin = await adminSession();
    const other = await createUser({ username: "admin02", roles: ["admin"] });
    await request(`/api/admin/users/${admin.id}/roles/viewer`, {
      method: "PUT",
      cookie: admin.cookie,
    });

    const self = await request(`/api/admin/users/${admin.id}/roles/admin`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(self.status).toBe(403);
    expect((await readJson(self)).code).toBe("FORBIDDEN");
    expect(await rolesOf(admin.cookie, admin.id)).toEqual(["admin", "viewer"]);

    const ownViewer = await request(`/api/admin/users/${admin.id}/roles/viewer`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(ownViewer.status).toBe(204);

    const otherAdmin = await request(`/api/admin/users/${other}/roles/admin`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(otherAdmin.status).toBe(204);
    expect(await rolesOf(admin.cookie, other)).toEqual([]);
  });

  it("いないユーザーと、ないロールは NOT_FOUND", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01" });
    const unknownUser = await request(`/api/admin/users/${UNKNOWN_ID}/roles/viewer`, {
      method: "PUT",
      cookie: admin.cookie,
    });
    expect(unknownUser.status).toBe(404);
    const unknownRole = await request(`/api/admin/users/${id}/roles/superuser`, {
      method: "PUT",
      cookie: admin.cookie,
    });
    expect(unknownRole.status).toBe(404);
  });
});

describe("無効化", () => {
  it("F-01 AC: 無効化したユーザーはログインできず、既存のセッションも失効する", async () => {
    const admin = await adminSession();
    const id = await createUser({ username: "user01", roles: ["viewer"] });
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
    const id = await createUser({ username: "user01", roles: ["viewer"] });
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
