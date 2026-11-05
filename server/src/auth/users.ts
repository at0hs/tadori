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

/**
 * Better Auth でユーザーを作り、ID を返す。
 * headers なしで呼ぶと Better Auth は権限を確かめない（library-checks.md BA-01）。
 * 呼ぶ前にアプリの認可を通すこと。
 */
export async function createUserAccount(input: NewUserAccount): Promise<string> {
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
}
