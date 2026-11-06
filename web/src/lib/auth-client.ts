import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// ログイン・ログアウト・自分のパスワードの変更だけは Better Auth の入口を通る（conventions.md 3章）。
// ほかの API は lib/api.ts を使う。
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [usernameClient()],
});
