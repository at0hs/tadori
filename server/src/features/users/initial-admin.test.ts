import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";
import { ensureInitialAdmin } from "./initial-admin.ts";

beforeEach(resetDb);

const CFG = {
  INITIAL_ADMIN_USERNAME: "admin",
  INITIAL_ADMIN_NAME: "管理者",
  INITIAL_ADMIN_EMAIL: "admin@example.test",
  INITIAL_ADMIN_PASSWORD: "Initial-passw0rd-dummy",
};

describe("初期管理者（D-20）", () => {
  it("ユーザーがいなければ作り、管理者ロールを user_roles と user.role の両方に持たせる（D-33）", async () => {
    expect(await ensureInitialAdmin(CFG)).toBe("created");
    const [u] = await db.select().from(user).where(eq(user.username, "admin"));
    expect(u?.role).toBe("admin");
    expect(u?.mustChangePassword).toBe(true);
    const roles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, u?.id ?? ""));
    expect(roles.map((r) => r.role)).toEqual(["admin"]);
  });

  it("初回ログインでパスワードの変更を求められる", async () => {
    await ensureInitialAdmin(CFG);
    const cookie = await login("admin", CFG.INITIAL_ADMIN_PASSWORD);
    const me = await readJson(await request("/api/me", { cookie }));
    expect(me).toMatchObject({ username: "admin", roles: ["admin"], mustChangePassword: true });
  });

  it("本番では .env.example のダミーの初期パスワードで作らない", async () => {
    await expect(ensureInitialAdmin({ ...CFG, NODE_ENV: "production" })).rejects.toThrow(
      /INITIAL_ADMIN_PASSWORD/,
    );
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it("本番でもユーザーがいればダミーの初期パスワードは問わない", async () => {
    await createUser({ username: "user01" });
    expect(await ensureInitialAdmin({ ...CFG, NODE_ENV: "production" })).toBe("skipped");
  });

  it("ユーザーがいれば何もしない", async () => {
    await createUser({ username: "user01" });
    expect(await ensureInitialAdmin(CFG)).toBe("skipped");
    expect(await db.select().from(user).where(eq(user.username, "admin"))).toEqual([]);
  });

  it("ユーザーがいないのに設定が足りなければ、起動を止める", async () => {
    await expect(ensureInitialAdmin({ ...CFG, INITIAL_ADMIN_PASSWORD: undefined })).rejects.toThrow(
      /INITIAL_ADMIN_PASSWORD/,
    );
  });
});
