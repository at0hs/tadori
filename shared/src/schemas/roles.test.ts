import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, type Permission, ROLES } from "./roles.ts";
import { createUserRequestSchema } from "./users.ts";

const permissions = Object.keys(PERMISSIONS) as Permission[];

describe("D-64 ロールの対応表", () => {
  it("上のロールは下のロールの権限をすべて持つ", () => {
    for (const p of permissions) {
      for (const [i, role] of ROLES.entries()) {
        if (can(role, p)) for (const upper of ROLES.slice(0, i)) expect(can(upper, p)).toBe(true);
      }
    }
  });

  it("D-65: 公開・アーカイブは承認者以上、下書きの編集は作業者以上", () => {
    expect(can("worker", "publishProcedure")).toBe(false);
    expect(can("approver", "publishProcedure")).toBe(true);
    expect(can("approver", "archiveProcedure")).toBe(true);
    expect(can("worker", "archiveProcedure")).toBe(false);
    expect(can("worker", "editProcedure")).toBe(true);
    expect(can("viewer", "editProcedure")).toBe(false);
  });

  it("閲覧者は何もできず、管理者はすべてできる", () => {
    for (const p of permissions) {
      expect(can("viewer", p)).toBe(false);
      expect(can("admin", p)).toBe(true);
    }
  });

  it("ユーザーの作成はロールを1つ必須にする", () => {
    const base = {
      name: "テスト 太郎",
      username: "taro",
      email: "taro@example.test",
      password: "Passw0rd-dummy",
    };
    expect(createUserRequestSchema.safeParse({ ...base, role: "worker" }).success).toBe(true);
    const missing = createUserRequestSchema.safeParse(base);
    expect(missing.error?.issues[0]).toMatchObject({
      path: ["role"],
      message: "ロールを選んでください。",
    });
    expect(createUserRequestSchema.safeParse({ ...base, role: "author" }).success).toBe(false);
  });
});
