import { expect, test } from "vitest";
import { ApiError } from "./api.ts";
import { createQueryClient, globalErrorAction } from "./query.ts";

test("未認証はログインへ、パスワード変更が必要は変更へ、他は何もしない", () => {
  expect(globalErrorAction(new ApiError({ code: "UNAUTHENTICATED", status: 401 }))).toBe("login");
  expect(globalErrorAction(new ApiError({ code: "PASSWORD_CHANGE_REQUIRED", status: 403 }))).toBe(
    "change-password",
  );
  expect(globalErrorAction(new ApiError({ code: "FORBIDDEN", status: 403 }))).toBeNull();
  expect(globalErrorAction(new Error("x"))).toBeNull();
});

async function failMutation(qc: ReturnType<typeof createQueryClient>, error: unknown) {
  await qc
    .getMutationCache()
    .build(qc, {
      mutationFn: async () => {
        throw error;
      },
    })
    .execute(undefined)
    .catch(() => {});
}

test("権限なしのエラーでは me を取り直す（ロールが外された場合に備える）", async () => {
  const qc = createQueryClient(() => {});
  qc.setQueryData(["me"], { id: "x" });
  await failMutation(qc, new ApiError({ code: "FORBIDDEN", status: 403 }));
  expect(qc.getQueryState(["me"])?.isInvalidated).toBe(true);
});

test("パスワード変更が必要のエラーでは me を取り直してから移す", async () => {
  const actions: string[] = [];
  const qc = createQueryClient((a) => actions.push(a));
  qc.setQueryData(["me"], { id: "x" });
  await failMutation(qc, new ApiError({ code: "PASSWORD_CHANGE_REQUIRED", status: 403 }));
  expect(qc.getQueryState(["me"])?.isInvalidated).toBe(true);
  expect(actions).toEqual(["change-password"]);
});
