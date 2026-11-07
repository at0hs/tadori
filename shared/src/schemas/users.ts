import { z } from "zod";
import { runningExecutionSchema } from "./executions.ts";
import { roleSchema } from "./roles.ts";

// ユーザー・ロールの管理（F-01、api.md 4.6）。管理者の API（/api/admin/users）の約束事。

// ユーザー名は Better Auth の username プラグインの既定の検証に合わせる（3〜30文字、英数字・_・.）。
// 保存するときは Better Auth が小文字にする。
export const usernameSchema = z
  .string()
  .min(3, "ユーザー名は3文字以上にしてください。")
  .max(30, "ユーザー名は30文字以内にしてください。")
  .regex(/^[a-zA-Z0-9_.]+$/, "ユーザー名には英数字・アンダースコア・ピリオドだけを使えます。");

export const userNameSchema = z
  .string()
  .trim()
  .min(1, "名前を入力してください。")
  .max(100, "名前は100文字以内にしてください。");

export const emailSchema = z
  .email("メールアドレスの形式が正しくありません。")
  .max(254, "メールアドレスが長すぎます。");

// パスワード。長さは Better Auth の既定（8〜128文字）に合わせる。自分で変えるとき（S-02）にも使う。
export const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上にしてください。")
  .max(128, "パスワードは128文字以内にしてください。");

// 管理者が決める仮のパスワード（作成・再設定）。規則は passwordSchema と同じ。
export const temporaryPasswordSchema = passwordSchema;

/** POST /api/admin/users */
export const createUserRequestSchema = z.object({
  name: userNameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: temporaryPasswordSchema,
  roles: z
    .array(roleSchema)
    .refine((roles) => new Set(roles).size === roles.length, "同じロールが重複しています。"),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const createUserResponseSchema = z.object({ id: z.uuid() });
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/** POST /api/admin/users/{id}/password-reset */
export const passwordResetRequestSchema = z.object({ password: temporaryPasswordSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/** パスのパラメータ */
export const userIdParamSchema = z.object({ id: z.uuid() });
export const userRoleParamSchema = z.object({ id: z.uuid(), role: roleSchema });

// 管理者の API だけが返すユーザーの情報（api.md 3章：ユーザー名・メールアドレス・ロール・有効かどうか）
export const adminUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  roles: z.array(roleSchema),
  banned: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** GET /api/admin/users */
export const adminUserListResponseSchema = z.object({ users: z.array(adminUserSchema) });
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/**
 * GET /api/admin/users/{id}
 * runningExecutions は、そのユーザーが実行者で実行中の実行（S-15、D-36）。無効化・ロールの剥奪の前の案内に使う。
 */
export const adminUserDetailResponseSchema = z.object({
  user: adminUserSchema,
  runningExecutions: z.array(runningExecutionSchema),
});
export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;
