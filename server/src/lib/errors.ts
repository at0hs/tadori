import { ERROR_CODES, type ErrorCode } from "@tadori/shared";

// サービスやミドルウェアが投げる例外（conventions.md 2.1、3章）。
// HTTP の応答への変換は app.onError が1か所で行う。
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly extra: Record<string, unknown>;

  constructor(code: ErrorCode, detail?: string, extra: Record<string, unknown> = {}) {
    super(detail ?? DEFAULT_DETAIL[code]);
    this.name = "AppError";
    this.code = code;
    this.extra = extra;
  }

  get status() {
    return ERROR_CODES[this.code];
  }
}

// detail は利用者に見せてよい日本語の文にする（conventions.md 3.1）。
const DEFAULT_DETAIL: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "入力に誤りがあります。",
  UNAUTHENTICATED: "ログインしてください。",
  PASSWORD_CHANGE_REQUIRED: "パスワードを変更してください。",
  FORBIDDEN: "この操作は許可されていません。",
  NOT_FOUND: "対象が見つかりません。",
  DRAFT_CONFLICT: "他のユーザーが先に下書きを保存しました。",
  STEP_STATUS_CONFLICT: "ステップの状態が変わっています。画面を読み込み直してください。",
  NOT_LATEST_VERSION: "最新の版ではありません。最新の版で開き直してください。",
  STATE_CONFLICT: "今の状態ではこの操作はできません。",
  UNSUPPORTED_MEDIA_TYPE: "JSON で送ってください。",
  INTERNAL_ERROR: "エラーが発生しました。時間をおいて試してください。",
};

const STATUS_TITLE: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  415: "Unsupported Media Type",
  500: "Internal Server Error",
};

// RFC 9457 の Problem Details（conventions.md 3.1）
export function problemBody(code: ErrorCode, detail?: string, extra: Record<string, unknown> = {}) {
  const status = ERROR_CODES[code];
  return {
    type: "about:blank",
    title: STATUS_TITLE[status] ?? "Error",
    status,
    code,
    detail: detail ?? DEFAULT_DETAIL[code],
    ...extra,
  };
}

export function problemResponse(
  code: ErrorCode,
  detail?: string,
  extra: Record<string, unknown> = {},
): Response {
  const body = problemBody(code, detail, extra);
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { "content-type": "application/problem+json" },
  });
}
