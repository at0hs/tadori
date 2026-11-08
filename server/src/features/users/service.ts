import type { AdminUser, CreateUserRequest, Role } from "@tadori/shared";
import { asc, eq, sql } from "drizzle-orm";
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
// 管理者であることの確認はルートのミドルウェアで済んでいる（authorization.md 2章の 3）。

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

function toAdminUser(row: UserRow, role: Role | null): AdminUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username ?? "",
    email: row.email,
    // 行がなければ閲覧者（authorization.md 1章）
    role: role ?? "viewer",
    banned: row.banned === true,
    mustChangePassword: row.mustChangePassword === true,
    createdAt: row.createdAt.toISOString(),
  };
}

/** ユーザーの一覧（S-13）。無効化したユーザーも含める。 */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({ ...userColumns, role: userRoles.role })
    .from(user)
    .leftJoin(userRoles, eq(userRoles.userId, user.id))
    .orderBy(asc(user.createdAt), asc(user.id));
  return rows.map((row) => toAdminUser(row, row.role));
}

/** ユーザーの詳細（S-15）。 */
export async function getUser(userId: string): Promise<AdminUser> {
  const [row] = await db
    .select({ ...userColumns, role: userRoles.role })
    .from(user)
    .leftJoin(userRoles, eq(userRoles.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) throw new AppError("NOT_FOUND");
  return toAdminUser(row, row.role);
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
    isAdmin: input.role === "admin",
    mustChangePassword: true,
  });
  await db.insert(userRoles).values({ userId: id, role: input.role, updatedBy: op.actor.id });

  logOperation(
    op.meta,
    { event: "user.created", actorId: op.actor.id, target: { type: "user", id }, role: input.role },
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

/**
 * ロールを変更する（D-64、api.md 4.6）。自分のロールは、同じロールでも変更できない（D-38）。
 * 行がないか違えば書き、user.role に管理者かどうかを写す（D-33）。
 * 操作ログは、実効のロール（行がなければ閲覧者）が変わったときだけ出す。
 */
export async function setRole(op: Operator, userId: string, role: Role) {
  const from = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if (userId === op.actor.id) throw new AppError("FORBIDDEN", "自分のロールは変更できません。");
    const [current] = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    if (current?.role !== role) {
      await tx
        .insert(userRoles)
        .values({ userId, role, updatedBy: op.actor.id })
        .onConflictDoUpdate({
          target: userRoles.userId,
          set: { role, updatedBy: op.actor.id, updatedAt: sql`now()` },
        });
      await tx
        .update(user)
        .set({ role: role === "admin" ? "admin" : "user" })
        .where(eq(user.id, userId));
    }
    return current?.role ?? "viewer";
  });

  if (from !== role) {
    logOperation(
      op.meta,
      {
        event: "user.role_changed",
        actorId: op.actor.id,
        target: { type: "user", id: userId },
        from,
        to: role,
      },
      "ロールを変更した",
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
