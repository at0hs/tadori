import { z } from "zod";

// ロール（requirements.md 3章、D-64）。1人1つの4段階で、上のロールは下のロールの権限をすべて持つ。
// 並びは上のロールから（表示の順もこれ）。
export const ROLES = ["admin", "approver", "worker", "viewer"] as const;

export const roleSchema = z.enum(ROLES, { error: "ロールを選んでください。" });
export type Role = z.infer<typeof roleSchema>;

/**
 * 操作ごとに必要な最も低いロール（authorization.md 3章、D-64・D-65）。どのロールが何をできるかは
 * ここだけに書く。サーバーの requirePermission・サービス・画面の出し分けはすべてこれを使う。
 * 操作を足す・必要なロールを変えるときは、ここを直す。
 */
export const PERMISSIONS = {
  /** ユーザーの作成・無効化・ロールの変更・パスワードの再設定 */
  manageUsers: "admin",
  /** 実行者が操作できなくなった実行の中止（D-36） */
  cancelAsAdmin: "admin",
  /** 実行記録の承認・差し戻し */
  approve: "approver",
  /** 手順書の公開（D-65） */
  publishProcedure: "approver",
  /** 手順書のアーカイブ（D-65） */
  archiveProcedure: "approver",
  /** 下書きの閲覧・作成・保存・破棄、未公開の手順書を見る（D-34） */
  editProcedure: "worker",
  /** 実行の開始、本人としての実行への操作、再依頼（D-35） */
  execute: "worker",
} as const satisfies Record<string, Role>;
export type Permission = keyof typeof PERMISSIONS;

/** role が min 以上のロールか。 */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLES.indexOf(role) <= ROLES.indexOf(min);
}

/** role の人が permission の操作をできるか。 */
export function can(role: Role, permission: Permission): boolean {
  return roleAtLeast(role, PERMISSIONS[permission]);
}
