import { expect, test } from "vitest";
import { ApiError } from "./api.ts";
import { globalErrorAction } from "./query.ts";

test("未認証はログインへ、パスワード変更が必要は変更へ、他は何もしない", () => {
  expect(globalErrorAction(new ApiError({ code: "UNAUTHENTICATED", status: 401 }))).toBe("login");
  expect(globalErrorAction(new ApiError({ code: "PASSWORD_CHANGE_REQUIRED", status: 403 }))).toBe(
    "change-password",
  );
  expect(globalErrorAction(new ApiError({ code: "FORBIDDEN", status: 403 }))).toBeNull();
  expect(globalErrorAction(new Error("x"))).toBeNull();
});
