import type { ProcedureContent } from "@tadori/shared";
import { expect, it } from "vitest";
import { AppError } from "../../lib/errors.ts";
import { checkVariables } from "./queries.ts";

const contentWith = (names: string[]) =>
  ({ variables: names.map((name) => ({ name, secret: false })) }) as unknown as ProcedureContent;

function errorsOf(fn: () => void) {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.extra.errors;
    throw e;
  }
  return undefined;
}

it("Object が持つ名前（constructor・toString）の変数も、値がなければ VALIDATION_FAILED", () => {
  expect(errorsOf(() => checkVariables(contentWith(["constructor", "toString"]), {}))).toEqual([
    { path: "variables.constructor", message: "値を入力してください。" },
    { path: "variables.toString", message: "値を入力してください。" },
  ]);
});

it("値がそろっていれば通る", () => {
  expect(errorsOf(() => checkVariables(contentWith(["constructor"]), { constructor: "x" }))).toBe(
    undefined,
  );
});
