import { expect, test } from "vitest";
import { ApiError, isApiError, toApiError } from "./api.ts";

const problem = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

test("Problem Details を ApiError にする", async () => {
  const res = problem(
    {
      status: 400,
      code: "VALIDATION_FAILED",
      detail: "入力に誤りがあります。",
      errors: [{ path: "username", message: "ユーザー名は3文字以上にしてください。" }],
    },
    400,
  );
  const e = await toApiError(res);
  expect(e).toBeInstanceOf(ApiError);
  expect(e).toMatchObject({
    code: "VALIDATION_FAILED",
    status: 400,
    message: "入力に誤りがあります。",
  });
  expect(e.errors).toEqual([
    { path: "username", message: "ユーザー名は3文字以上にしてください。" },
  ]);
});

test("JSON でない応答は UNKNOWN", async () => {
  const e = await toApiError(new Response("<html>", { status: 502 }));
  expect(e).toMatchObject({
    code: "UNKNOWN",
    status: 502,
    message: "エラーが発生しました。時間をおいて試してください。",
  });
  expect(e.errors).toEqual([]);
});

test("知らないコードは UNKNOWN", async () => {
  const e = await toApiError(problem({ status: 418, code: "TEAPOT", detail: "x" }, 418));
  expect(e.code).toBe("UNKNOWN");
});

test("isApiError はコードでも絞れる", () => {
  const e = new ApiError({ code: "NOT_FOUND", status: 404 });
  expect(isApiError(e)).toBe(true);
  expect(isApiError(e, "NOT_FOUND")).toBe(true);
  expect(isApiError(e, "FORBIDDEN")).toBe(false);
  expect(isApiError(new Error("x"))).toBe(false);
});
