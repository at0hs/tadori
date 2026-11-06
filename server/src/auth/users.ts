import { APIError } from "better-auth/api";
import { AppError } from "../lib/errors.ts";
import { auth } from "./auth.ts";

export type NewUserAccount = {
  username: string;
  name: string;
  email: string;
  password: string;
  /** 管理者ロールの有無を user.role に写す（D-33）。ロールの正本の user_roles はアプリが作る。 */
  isAdmin: boolean;
  mustChangePassword: boolean;
};

// Better Auth が重複を見つけたときのエラーコードと、入力の欄の対応
const DUPLICATE_ERRORS: Record<string, { path: string; message: string }> = {
  USERNAME_IS_ALREADY_TAKEN: { path: "username", message: "このユーザー名は使われています。" },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    path: "email",
    message: "このメールアドレスは使われています。",
  },
};

/**
 * Better Auth でユーザーを作り、ID を返す。
 * headers なしで呼ぶと Better Auth は権限を確かめない（library-checks.md BA-01）。
 * 呼ぶ前にアプリの認可を通すこと。
 * ユーザー名・メールアドレスが使われていたら VALIDATION_FAILED にする。
 */
export async function createUserAccount(input: NewUserAccount): Promise<string> {
  try {
    const { user } = await auth.api.createUser({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        role: input.isAdmin ? "admin" : "user",
        data: { username: input.username, mustChangePassword: input.mustChangePassword },
      },
    });
    return user.id;
  } catch (err) {
    const duplicate =
      err instanceof APIError ? DUPLICATE_ERRORS[String(err.body?.code)] : undefined;
    if (duplicate) throw new AppError("VALIDATION_FAILED", undefined, { errors: [duplicate] });
    throw err;
  }
}

/**
 * 無効化する（authorization.md 4.3）。既存のセッションも失効する。期限は付けない。
 * admin プラグインが操作する人の user.role を確かめるので、操作する人のセッションのヘッダを渡す。
 */
export async function banUserAccount(operatorHeaders: Headers, userId: string) {
  await auth.api.banUser({ headers: operatorHeaders, body: { userId } });
}

/** パスワードを設定し、そのユーザーのセッションを失効させる（D-37）。 */
export async function setPasswordAndRevokeSessions(
  operatorHeaders: Headers,
  userId: string,
  password: string,
) {
  await auth.api.setUserPassword({
    headers: operatorHeaders,
    body: { userId, newPassword: password },
  });
  await auth.api.revokeUserSessions({ headers: operatorHeaders, body: { userId } });
}

/**
 * 復旧のコマンド（D-51）用。操作する人のセッションがないので、Better Auth の内部の API で直接行う。
 * 「パスワード変更が必要」にし、パスワードを設定し、セッションを失効させ、最後に無効化を解く。
 * 途中で失敗しても、仮のパスワードで変更を求められずに使える状態を作らない（conventions.md 4.4 と同じ考え方）。
 * user.role（D-33）とロールの正本（user_roles）は呼び出し側が直す。
 */
export async function recoverAccount(userId: string, password: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(userId, { mustChangePassword: true });
  const hash = await ctx.password.hash(password);
  if (await ctx.internalAdapter.findCredentialAccount(userId)) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(userId);
  await ctx.internalAdapter.updateUser(userId, {
    banned: false,
    banReason: null,
    banExpires: null,
  });
}
