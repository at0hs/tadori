import { z } from "zod";
import { findVariableRefs, VARIABLE_NAME_RE } from "../variables/parse.ts";

// 手順書・版・下書き（F-02、F-03、api.md 4.3）。
// 手順書の文書（data-model.md 3章、D-24）は、このスキーマを正本とし、下書きの保存と公開の両方で検証する。
// 長さの上限は api.md 6章で実装に回したもの。

const LONG_TEXT = 20000;

const titleSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "タイトルを入力してください。")
    .max(max, `タイトルは${max}文字以内にしてください。`);

const longText = (label: string) =>
  z.string().max(LONG_TEXT, `${label}は${LONG_TEXT}文字以内にしてください。`);

export const procedureStepSchema = z.object({
  id: z.uuid(),
  title: titleSchema(200),
  description: longText("説明"),
  command: longText("コマンド"),
  verification: longText("確認方法"),
  evidenceRequired: z.boolean(),
});
export type ProcedureStep = z.infer<typeof procedureStepSchema>;

export const variableNameSchema = z
  .string()
  .regex(VARIABLE_NAME_RE, "変数名は英字で始め、英数字・「_」・「-」で64文字以内にしてください。");

export const procedureVariableSchema = z
  .object({
    name: variableNameSchema,
    description: z.string().max(500, "説明は500文字以内にしてください。"),
    default: z.string().max(1000, "既定値は1000文字以内にしてください。").nullable(),
    secret: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // D-26：秘密変数には既定値を持たせない
    if (v.secret && v.default !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: "秘密変数には既定値を設定できません。",
      });
    }
  });
export type ProcedureVariable = z.infer<typeof procedureVariableSchema>;

const tagSchema = z
  .string()
  .trim()
  .min(1, "タグを入力してください。")
  .max(50, "タグは50文字以内にしてください。");

export const procedureContentSchema = z
  .object({
    title: titleSchema(200),
    summary: z.string().max(1000, "概要は1000文字以内にしてください。"),
    tags: z
      .array(tagSchema)
      .max(20, "タグは20個までです。")
      .refine((tags) => new Set(tags).size === tags.length, "同じタグが重複しています。"),
    prerequisites: longText("前提条件"),
    variables: z.array(procedureVariableSchema).max(100, "変数は100個までです。"),
    steps: z.array(procedureStepSchema).max(500, "ステップは500個までです。"),
    rollbackSteps: z.array(procedureStepSchema).max(500, "ステップは500個までです。"),
  })
  .superRefine((c, ctx) => {
    // 大文字小文字だけが違う名前は定義できない（F-04）。後の方をエラーにする
    const names = new Set<string>();
    c.variables.forEach((v, i) => {
      const key = v.name.toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["variables", i, "name"],
          message: "同じ名前の変数があります（大文字と小文字の違いだけの名前も使えません）。",
        });
      }
      names.add(key);
    });
    // ステップの id は文書の中（手順と切り戻しを合わせて）で一意（data-model.md 3章）
    const ids = new Set<string>();
    for (const list of ["steps", "rollbackSteps"] as const) {
      c[list].forEach((s, i) => {
        if (ids.has(s.id)) {
          ctx.addIssue({
            code: "custom",
            path: [list, i, "id"],
            message: "ステップの ID が重複しています。",
          });
        }
        ids.add(s.id);
      });
    }
  });
export type ProcedureContent = z.infer<typeof procedureContentSchema>;

export type FieldError = { path: string; message: string };

const SUBSTITUTED_FIELDS = ["title", "description", "command", "verification"] as const;

/**
 * 公開時の検証（F-02 の AC、D-32）。保存時の検証に通った文書に対して行う。
 * 未定義の変数の参照は、置換の対象の欄（ステップのタイトル・説明・コマンド・確認方法）だけを調べる。
 */
export function findPublishErrors(content: ProcedureContent): FieldError[] {
  const errors: FieldError[] = [];
  if (content.steps.length === 0) {
    errors.push({ path: "steps", message: "公開するには、手順のステップが1つ以上必要です。" });
  }
  const defined = new Set(content.variables.map((v) => v.name));
  for (const list of ["steps", "rollbackSteps"] as const) {
    content[list].forEach((s, i) => {
      for (const field of SUBSTITUTED_FIELDS) {
        const undefinedNames = new Set(
          findVariableRefs(s[field])
            .map((r) => r.name)
            .filter((n) => !defined.has(n)),
        );
        for (const name of undefinedNames) {
          errors.push({
            path: `${list}.${i}.${field}`,
            message: `未定義の変数 #{${name}} を参照しています。`,
          });
        }
      }
    });
  }
  return errors;
}

// ===== API の約束事 =====

export const PROCEDURE_STATUSES = ["unpublished", "published", "editing", "archived"] as const;
export const procedureStatusSchema = z.enum(PROCEDURE_STATUSES);
export type ProcedureStatus = z.infer<typeof procedureStatusSchema>;

/** 記録の中の他のユーザー。ID と名前だけ（api.md 3章、D-49）。 */
export const userRefSchema = z.object({ id: z.string(), name: z.string() });
export type UserRef = z.infer<typeof userRefSchema>;

/**
 * 読み込んだ時点の照合の材料（D-05、D-55）。
 * 下書きがあれば revision、なければ revision: null と読み込んだ版数。
 */
export const draftLockSchema = z.union([
  z.object({ revision: z.number().int().positive() }),
  z.object({ revision: z.null(), versionNo: z.number().int().positive() }),
]);
export type DraftLock = z.infer<typeof draftLockSchema>;

/** DRAFT_CONFLICT の応答に付ける項目（conventions.md 3.1）。 */
export const draftConflictSchema = z.object({
  reason: z.enum(["draft_saved", "version_published", "draft_discarded"]),
  updatedBy: userRefSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type DraftConflict = z.infer<typeof draftConflictSchema>;

const versionInfo = {
  versionNo: z.number().int(),
  publishedBy: userRefSchema,
  publishedAt: z.iso.datetime(),
  changeReason: z.string(),
};

/** GET /api/procedures */
export const procedureSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  status: procedureStatusSchema,
  latestVersionNo: z.number().int().nullable(),
  lastPublishedAt: z.iso.datetime().nullable(),
});
export type ProcedureSummary = z.infer<typeof procedureSummarySchema>;
export const procedureListResponseSchema = z.object({
  procedures: z.array(procedureSummarySchema),
});
export type ProcedureListResponse = z.infer<typeof procedureListResponseSchema>;

/** GET /api/procedures/{id}。draft は作成者ロールの人で下書きがあるときだけ値を持つ。 */
export const procedureDetailResponseSchema = z.object({
  id: z.uuid(),
  status: procedureStatusSchema,
  latestVersion: z.object({ ...versionInfo, content: procedureContentSchema }).nullable(),
  draft: z.object({ updatedBy: userRefSchema, updatedAt: z.iso.datetime() }).nullable(),
});
export type ProcedureDetailResponse = z.infer<typeof procedureDetailResponseSchema>;

/** GET /api/procedures/{id}/versions（新しい順） */
export const procedureVersionListResponseSchema = z.object({
  title: z.string(),
  versions: z.array(z.object(versionInfo)),
});
export type ProcedureVersionListResponse = z.infer<typeof procedureVersionListResponseSchema>;

/** GET /api/procedures/{id}/versions/{versionNo} */
export const procedureVersionResponseSchema = z.object({
  ...versionInfo,
  title: z.string(),
  content: procedureContentSchema,
  latestVersionNo: z.number().int(),
});
export type ProcedureVersionResponse = z.infer<typeof procedureVersionResponseSchema>;

/** GET /api/procedures/{id}/draft */
export const draftResponseSchema = z.object({
  status: procedureStatusSchema,
  content: procedureContentSchema,
  lock: draftLockSchema,
  baseVersionNo: z.number().int().nullable(),
  updatedBy: userRefSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type DraftResponse = z.infer<typeof draftResponseSchema>;

/** POST /api/procedures */
export const createProcedureRequestSchema = z.object({ content: procedureContentSchema });
export type CreateProcedureRequest = z.infer<typeof createProcedureRequestSchema>;
export type CreateProcedureResponse = { id: string; revision: number };

/** PUT /api/procedures/{id}/draft */
export const saveDraftRequestSchema = z.object({
  content: procedureContentSchema,
  lock: draftLockSchema,
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;
export type SaveDraftResponse = { revision: number; updatedBy: UserRef; updatedAt: string };

/** POST /api/procedures/{id}/publish */
export const publishRequestSchema = z.object({
  content: procedureContentSchema,
  lock: draftLockSchema,
  changeReason: z
    .string()
    .trim()
    .min(1, "変更理由を入力してください。")
    .max(1000, "変更理由は1000文字以内にしてください。"),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type PublishResponse = { versionNo: number };

/** DELETE /api/procedures/{id}/draft?revision=N */
export const discardDraftQuerySchema = z.object({ revision: z.coerce.number().int().positive() });
export type DiscardDraftResponse = { deleted: "draft" | "procedure" };

/** パスのパラメータ */
export const procedureIdParamSchema = z.object({ id: z.uuid() });
export const versionParamSchema = z.object({
  id: z.uuid(),
  versionNo: z.coerce.number().int().positive(),
});
