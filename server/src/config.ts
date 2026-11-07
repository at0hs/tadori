import { z } from "zod";

// 環境変数（operations.md 2.1）。起動時に1回だけ検証する。
const schema = z.object({
  // 利用者がブラウザで開く URL（D-52）。Better Auth の基準 URL と CSRF の確認に使う。
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  // 前段のリバースプロキシのアドレス（カンマ区切り）。指定したときだけ転送のヘッダを信じる（D-52、D-60）。
  TRUSTED_PROXIES: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
    ),
  PORT: z.coerce.number().int().positive().default(3000),
  // 初期管理者（D-20）。ユーザーが1人もいないときだけ使う。
  INITIAL_ADMIN_USERNAME: z.string().optional(),
  INITIAL_ADMIN_NAME: z.string().optional(),
  INITIAL_ADMIN_EMAIL: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  // ビルドした画面の置き場。指定したときだけ配信する（開発では Vite が配信する）。
  WEB_DIST_DIR: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
});

// .env.example のダミーの秘密鍵。本番でこのまま動かさない。
const EXAMPLE_SECRET = "dev-secret-dev-secret-dev-secret-0123456789";

export type Config = z.infer<typeof schema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`環境変数が正しくない：\n${z.prettifyError(result.error)}`);
  }
  if (result.data.NODE_ENV === "production" && result.data.BETTER_AUTH_SECRET === EXAMPLE_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET が .env.example のダミーの値のままです。作り直してください（例：openssl rand -base64 32）",
    );
  }
  return result.data;
}

export const config = parseConfig(process.env);
export const appOrigin = new URL(config.APP_URL).origin;
