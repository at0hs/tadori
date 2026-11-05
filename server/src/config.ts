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
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`環境変数が正しくない：\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const config = load();
export const appOrigin = new URL(config.APP_URL).origin;
