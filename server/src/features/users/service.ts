import { type AdminUser, type CreateUserRequest, ROLES, type Role } from "@tadori/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  banUserAccount,
  createUserAccount,
  setPasswordAndRevokeSessions,
} from "../../auth/users.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";

// ユーザー・ロールの管理（F-01、authorization.md 3.1・4章、conventions.md 4.4）。
// 管理者ロールの確認はルートのミドルウェアで済んでいる（authorization.md 2章の 3）。

const userColumns = {
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  banned: user.banned,
  mustChangePassword: user.mustChangePassword,
  createdAt: user.createdAt,
};

type UserRow = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  createdAt: Date;
};

const byRoleOrder = (a: Role, b: Role) => ROLES.indexOf(a) - ROLES.indexOf(b);

async function rolesOf(userIds: string[]): Promise<Map<string, Role[]>> {
  const map = new Map<string, Role[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(inArray(userRoles.userId, userIds));
  for (const { userId, role } of rows) {
    map.set(userId, [...(map.get(userId) ?? []), role]);
  }
  for (const roles of map.values()) roles.sort(byRoleOrder);
  return map;
}

function toAdminUser(row: UserRow, roles: Role[]): AdminUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username ?? "",
    email: row.email,
    roles,
    banned: row.banned === true,
    mustChangePassword: row.mustChangePassword === true,
    createdAt: row.createdAt.toISOString(),
  };
}

/** ユーザーの一覧（S-13）。無効化したユーザーも含める。 */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await db.select(userColumns).from(user).orderBy(asc(user.createdAt), asc(user.id));
  const roles = await rolesOf(rows.map((r) => r.id));
  return rows.map((row) => toAdminUser(row, roles.get(row.id) ?? []));
}

/** ユーザーの詳細（S-15）。 */
export async function getUser(userId: string): Promise<AdminUser> {
  const [row] = await db.select(userColumns).from(user).where(eq(user.id, userId));
  if (!row) throw new AppError("NOT_FOUND");
  const roles = await rolesOf([userId]);
  return toAdminUser(row, roles.get(userId) ?? []);
}

/**
 * ユーザーを作成する。「パスワード変更が必要」にする（S-14）。
 * Better Auth で作った後に、アプリのトランザクションでロールを登録する（conventions.md 4.4）。
 */
export async function createUser(op: Operator, input: CreateUserRequest): Promise<{ id: string }> {
  const id = await createUserAccount({
    username: input.username,
    name: input.name,
    email: input.email,
    password: input.password,
    isAdmin: input.roles.includes("admin"),
    mustChangePassword: true,
  });
  if (input.roles.length > 0) {
    await db
      .insert(userRoles)
      .values(input.roles.map((role) => ({ userId: id, role, grantedBy: op.actor.id })));
  }

  logOperation(
    op.meta,
    {
      event: "user.created",
      actorId: op.actor.id,
      target: { type: "user", id },
      roles: [...input.roles].sort(byRoleOrder),
    },
    "ユーザーを作成した",
  );
  return { id };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 対象のユーザーの行をロックする（conventions.md 4.2）。いなければ NOT_FOUND。 */
async function lockUser(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND");
}

/** 管理者ロールの有無を user.role に写す（D-33）。ロールを変えたのと同じトランザクションの中で呼ぶ。 */
async function syncAdminColumn(tx: Tx, userId: string) {
  const admin = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")));
  await tx
    .update(user)
    .set({ role: admin.length > 0 ? "admin" : "user" })
    .where(eq(user.id, userId));
}

/** ロールを付与する。すでに持っていれば何もしない（api.md 4.6）。操作ログは変わったときだけ出す。 */
export async function grantRole(op: Operator, userId: string, role: Role) {
  const changed = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const inserted = await tx
      .insert(userRoles)
      .values({ userId, role, grantedBy: op.actor.id })
      .onConflictDoNothing()
      .returning({ role: userRoles.role });
    if (role === "admin") await syncAdminColumn(tx, userId);
    return inserted.length > 0;
  });

  if (changed) {
    logOperation(
      op.meta,
      {
        event: "user.role_granted",
        actorId: op.actor.id,
        target: { type: "user", id: userId },
        role,
      },
      "ロールを付与した",
    );
  }
}

/**
 * ロールを剥奪する。持っていなければ何もしない（api.md 4.6）。操作ログは変わったときだけ出す。
 * 自分の管理者ロールは剥奪できない（D-38）。
 */
export async function revokeRole(op: Operator, userId: string, role: Role) {
  const changed = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if (userId === op.actor.id && role === "admin") {
      throw new AppError("FORBIDDEN", "自分の管理者ロールは剥奪できません。");
    }
    const deleted = await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
      .returning({ role: userRoles.role });
    if (role === "admin") await syncAdminColumn(tx, userId);
    return deleted.length > 0;
  });

  if (changed) {
    logOperation(
      op.meta,
      {
        event: "user.role_revoked",
        actorId: op.actor.id,
        target: { type: "user", id: userId },
        role,
      },
      "ロールを剥奪した",
    );
  }
}

/** 対象のユーザーがいることを確かめ、無効化されているかを返す。 */
async function findTarget(userId: string) {
  const [row] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, userId));
  if (!row) throw new AppError("NOT_FOUND");
  return { banned: row.banned === true };
}

/**
 * 無効化する。自分自身は無効化できない（D-38）。すでに無効なら何もしない。
 * user の行はロックしない。Better Auth が別の接続で同じ行を更新するため（conventions.md 4.4）。
 */
export async function banUser(op: Operator, userId: string) {
  const target = await findTarget(userId);
  if (userId === op.actor.id) throw new AppError("FORBIDDEN", "自分自身は無効化できません。");
  if (target.banned) return;

  await banUserAccount(op.authHeaders, userId);
  logOperation(
    op.meta,
    { event: "user.banned", actorId: op.actor.id, target: { type: "user", id: userId } },
    "ユーザーを無効化した",
  );
}

/**
 * パスワードを仮のものに再設定する（D-37）。自分自身には使えない。
 * 先に「パスワード変更が必要」を真にしてコミットし、その後でパスワードを設定してセッションを失効させる。
 * 途中で失敗しても、仮のパスワードで変更を求められずに使える状態を作らない（conventions.md 4.4）。
 */
export async function resetPassword(op: Operator, userId: string, password: string) {
  await findTarget(userId);
  if (userId === op.actor.id) {
    throw new AppError(
      "FORBIDDEN",
      "自分のパスワードは再設定できません。パスワードの変更から変えてください。",
    );
  }

  await db.update(user).set({ mustChangePassword: true }).where(eq(user.id, userId));
  await setPasswordAndRevokeSessions(op.authHeaders, userId, password);

  // 仮のパスワードはログに出さない（D-37、conventions.md 6.3）
  logOperation(
    op.meta,
    { event: "user.password_reset", actorId: op.actor.id, target: { type: "user", id: userId } },
    "パスワードを再設定した",
  );
}
