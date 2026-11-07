import type { AppType } from "@tadori/server/app";
import { ERROR_CODES, type ErrorCode } from "@tadori/shared";
import { hc } from "hono/client";

// アプリの API の呼び出し（conventions.md 2.2）。エラーの応答（Problem Details、3章）は
// エラーコードを持つ ApiError にして投げる。画面はコードを見て動きを変える（screens.md 8章）。
// ログイン・ログアウト・自分のパスワードの変更だけは Better Auth のクライアント（auth-client.ts）を使う。

export type FieldError = { path: string; message: string };

const DEFAULT_MESSAGE = "エラーが発生しました。時間をおいて試してください。";

export class ApiError extends Error {
  readonly code: ErrorCode | "UNKNOWN";
  readonly status: number;
  readonly errors: FieldError[];
  /** Problem Details の標準の項目と code・errors 以外（DRAFT_CONFLICT の保存者など、conventions.md 3.1）。 */
  readonly extra: Record<string, unknown>;

  constructor(init: {
    code: ErrorCode | "UNKNOWN";
    status: number;
    message?: string;
    errors?: FieldError[];
    extra?: Record<string, unknown>;
  }) {
    super(init.message ?? DEFAULT_MESSAGE);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.errors = init.errors ?? [];
    this.extra = init.extra ?? {};
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}

function toFieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is FieldError =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as FieldError).path === "string" &&
      typeof (e as FieldError).message === "string",
  );
}

export async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiError({ code: "UNKNOWN", status: res.status });
  }
  if (typeof body !== "object" || body === null) {
    return new ApiError({ code: "UNKNOWN", status: res.status });
  }
  const {
    code,
    detail,
    errors,
    type: _t,
    title: _ti,
    status: _s,
    instance: _i,
    ...extra
  } = body as Record<string, unknown>;
  if (!isErrorCode(code)) return new ApiError({ code: "UNKNOWN", status: res.status });
  return new ApiError({
    code,
    status: res.status,
    message: typeof detail === "string" ? detail : undefined,
    errors: toFieldErrors(errors),
    extra,
  });
}

export function isApiError(e: unknown, code?: ErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) throw await toApiError(res);
  return res;
}

/** 例：`await (await api.admin.users.$get()).json()` */
export const api = hc<AppType>("/", { fetch: apiFetch }).api;
