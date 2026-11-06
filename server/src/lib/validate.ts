import { validator } from "hono/validator";
import type { z } from "zod";
import { AppError } from "./errors.ts";

const JSON_TYPE = /^application\/([a-z-.]+\+)?json(;.*)?$/i;

/** Zod のエラーを Problem Details の errors（conventions.md 3.1）に変える。 */
export function toFieldErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/**
 * リクエストの本文を shared/ の Zod スキーマで検証する（conventions.md 2.1、5章）。
 * JSON でなければ UNSUPPORTED_MEDIA_TYPE、スキーマに合わなければ VALIDATION_FAILED。
 * hono/validator を使うので、Hono RPC で画面に入力の型が伝わる（D-11）。
 */
export function jsonBody<T extends z.ZodType>(schema: T) {
  return validator("json", (value, c): z.output<T> => {
    if (!JSON_TYPE.test(c.req.header("content-type") ?? "")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new AppError("VALIDATION_FAILED", undefined, { errors: toFieldErrors(result.error) });
    }
    return result.data;
  });
}

/** パスのパラメータを検証する。合わなければ、対象がないものとして NOT_FOUND にする。 */
export function pathParams<T extends z.ZodType>(schema: T) {
  return validator("param", (value): z.output<T> => {
    const result = schema.safeParse(value);
    if (!result.success) throw new AppError("NOT_FOUND");
    return result.data;
  });
}
