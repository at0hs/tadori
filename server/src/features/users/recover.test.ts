import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { recoverAdmin } from "./recover.ts";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

describe("管理者の復旧のコマンド（D-51）", () => {
  it("無効化された、管理者ロールのないユーザーを、パスワード変更が必要な管理者に戻す", async () => {
    await createUser({ username: "admin01", role: "admin" });
    const id = await createUser({ username: "admin02", role: "viewer" });
    const oldCookie = await login("admin02");
    const adminCookie = await login("admin01");
    await request(`/api/admin/users/${id}/ban`, { method: "POST", cookie: adminCookie });
    const logs = captureOperationLogs();

    const { userId, password } = await recoverAdmin("ADMIN02");
    expect(userId).toBe(id);
    expect(password).toHaveLength(24);

    // 古いパスワードとセッションは使えない
    expect((await request("/api/me", { cookie: oldCookie })).status).toBe(401);
    const old = await request("/api/auth/sign-in/username", {
      json: { username: "admin02", password: PASSWORD },
    });
    expect(old.status).toBe(401);

    const cookie = await login("admin02", password);
    expect(await readJson(await request("/api/me", { cookie }))).toMatchObject({
      role: "admin",
      mustChangePassword: true,
    });
    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row).toMatchObject({ banned: false, role: "admin" });
    expect(await adminColumnMismatches()).toEqual([]);

    expect(logs.filter((l) => l.event === "user.recovered")).toEqual([
      expect.objectContaining({
        target: { type: "user", id },
        unbanned: true,
        adminRoleGranted: true,
      }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(password);
  });

  it("作業者を管理者にし、最後にロールを設定した人は本人にする（D-64）", async () => {
    const id = await createUser({ username: "worker01", role: "worker" });
    const logs = captureOperationLogs();
    await recoverAdmin("worker01");
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    expect(rows).toEqual([expect.objectContaining({ role: "admin", updatedBy: id })]);
    expect(await adminColumnMismatches()).toEqual([]);
    expect(logs.find((l) => l.event === "user.recovered")).toMatchObject({
      adminRoleGranted: true,
    });
  });

  it("ロールの行がないユーザーにも管理者の行を作る", async () => {
    const id = await createUser({ username: "norole01", role: null });
    await recoverAdmin("norole01");
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    expect(rows).toEqual([expect.objectContaining({ role: "admin", updatedBy: id })]);
  });

  it("すでに管理者なら adminRoleGranted は偽", async () => {
    await createUser({ username: "admin03", role: "admin" });
    const logs = captureOperationLogs();
    await recoverAdmin("admin03");
    expect(logs.find((l) => l.event === "user.recovered")).toMatchObject({
      adminRoleGranted: false,
    });
  });

  it("いないユーザー名ならエラーにし、何も変えない", async () => {
    await expect(recoverAdmin("nobody")).rejects.toThrow(/nobody/);
  });
});
