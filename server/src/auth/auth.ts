import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import { config } from "../config.ts";
import { db } from "../db/client.ts";
import { account, session, user, verification } from "../db/schema/auth.ts";

// Better Auth を使うのは auth/ の中だけ（D-14）。ほかのコードは auth/ のモジュールを通す。

// 操作がないとセッションが切れるまでの時間（D-14）。4時間。
const SESSION_IDLE_TIMEOUT_SECONDS = 4 * 60 * 60;

// ログインの回数制限（D-52）。60 秒に 20 回。
export const SIGN_IN_RATE_LIMIT = { window: 60, max: 20 };

export const auth = betterAuth({
  baseURL: config.APP_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // 自己登録はしない。ユーザーは管理者が作る（F-01）。
    disableSignUp: true,
  },
  session: {
    expiresIn: SESSION_IDLE_TIMEOUT_SECONDS,
    // 期限の延長を頻繁にして、「最後の操作から」切れるようにする。
    updateAge: 60,
    // Cookie キャッシュは使わない（期限切れや ban をすぐ反映する。D-14）。既定で無効。
  },
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  // 回数制限は本番だけの既定に任せず、明示して有効にする（D-52）。
  // IP とパスごとに、成功も含めて数える。全員が同じ IP（NAT）から来る場合も考えた値（D-60）。
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/username": SIGN_IN_RATE_LIMIT,
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    // 転送のヘッダはアプリが付け直してから渡す（D-60、auth/routes.ts）。
    ...(config.TRUSTED_PROXIES.length > 0
      ? { ipAddress: { trustedProxies: config.TRUSTED_PROXIES } }
      : {}),
  },
  plugins: [username(), admin()],
  hooks: {
    // after フックはサーバーの中からの auth.api.* の呼び出しでも動くので、パスで分ける（D-14 の補足）。
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/change-password" && !(ctx.context.returned instanceof Error)) {
        const userId = ctx.context.session?.user.id;
        if (userId) {
          await ctx.context.internalAdapter.updateUser(userId, { mustChangePassword: false });
        }
      }
    }),
  },
});
