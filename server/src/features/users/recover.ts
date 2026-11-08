import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { recoverAccount } from "../../auth/users.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";
import { logOperation } from "../../lib/operation-log.ts";

/** 仮のパスワードを作る。24文字（144 ビット）。 */
export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * 管理者を復旧する（D-51、operations.md 8章）。app コンテナの中のコマンドからだけ呼ぶ。
 * 仮のパスワードにして「パスワード変更が必要」にし、セッションを失効させ、無効化を解き、ロールを管理者にする。
 * 仮のパスワードはコマンドの引数で受け取らず、ここで作って返す（呼び出し側が一度だけ画面に出す）。
 */
export async function recoverAdmin(
  username: string,
): Promise<{ userId: string; password: string }> {
  const [target] = await db
    .select({ id: user.id, banned: user.banned })
    .from(user)
    .where(eq(user.username, username.toLowerCase()));
  if (!target) throw new Error(`ユーザー名「${username}」のユーザーがいない`);

  const password = generateTemporaryPassword();
  await recoverAccount(target.id, password);

  // ロールの正本と user.role（D-33）を同じトランザクションで管理者にする。
  // 最後にロールを設定した人は本人にする（data-model.md 4.1）
  const granted = await db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, target.id)).for("update");
    const [current] = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, target.id));
    await tx
      .insert(userRoles)
      .values({ userId: target.id, role: "admin", updatedBy: target.id })
      .onConflictDoUpdate({
        target: userRoles.userId,
        set: { role: "admin", updatedBy: target.id, updatedAt: sql`now()` },
      });
    await tx.update(user).set({ role: "admin" }).where(eq(user.id, target.id));
    return current?.role !== "admin";
  });

  // 仮のパスワードはログに出さない
  logOperation(
    {},
    {
      event: "user.recovered",
      target: { type: "user", id: target.id },
      unbanned: target.banned === true,
      adminRoleGranted: granted,
    },
    "復旧のコマンドで管理者を復旧した",
  );
  return { userId: target.id, password };
}
