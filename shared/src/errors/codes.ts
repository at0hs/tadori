// エラーコードの一覧（conventions.md 3.2）。画面とサーバーで同じものを使う。
// コードは足すだけで、意味を変えたり使い回したりしない。
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  PASSWORD_CHANGE_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DRAFT_CONFLICT: 409,
  STEP_STATUS_CONFLICT: 409,
  NOT_LATEST_VERSION: 409,
  STATE_CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_CODES;
