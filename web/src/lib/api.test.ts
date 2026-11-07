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

test("標準の項目と code・errors 以外は extra に入れる（DRAFT_CONFLICT の保存者など）", async () => {
  const e = await toApiError(
    problem(
      {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "DRAFT_CONFLICT",
        detail: "他のユーザーが先に下書きを保存しました。",
        reason: "draft_saved",
        updatedBy: { id: "u1", name: "作成者 太郎" },
        updatedAt: "2026-11-05T01:23:45.000Z",
      },
      409,
    ),
  );
  expect(e.extra).toEqual({
    reason: "draft_saved",
    updatedBy: { id: "u1", name: "作成者 太郎" },
    updatedAt: "2026-11-05T01:23:45.000Z",
  });
});
