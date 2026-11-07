import type { ExecutionDetailResponse, MeResponse, Role } from "@tadori/shared";
import { expect, test } from "vitest";
import { approvalAction } from "./approval-action.ts";

const EXECUTOR = "01970000-0000-7000-8000-0000000000a1";
const OTHER = "01970000-0000-7000-8000-0000000000b2";

const detail = (o: Partial<ExecutionDetailResponse>) =>
  ({
    executor: { id: EXECUTOR, name: "実行 太郎" },
    status: "completed",
    approvalStatus: "pending",
    ...o,
  }) as ExecutionDetailResponse;

const me = (id: string, roles: Role[]): MeResponse => ({
  id,
  name: "誰か",
  username: "someone",
  roles,
  mustChangePassword: false,
});

test("承認待ち・承認者・実行者でない → review", () => {
  expect(approvalAction(detail({}), me(OTHER, ["approver"]))).toBe("review");
});

test("承認待ち・承認者だが自分の実行 → null", () => {
  expect(approvalAction(detail({}), me(EXECUTOR, ["approver", "executor"]))).toBeNull();
});

test("承認待ち・承認者ロールなし → null", () => {
  expect(approvalAction(detail({}), me(OTHER, ["executor", "admin"]))).toBeNull();
});

test("差し戻し・本人（実行者ロールあり） → resubmit", () => {
  expect(approvalAction(detail({ approvalStatus: "rejected" }), me(EXECUTOR, ["executor"]))).toBe(
    "resubmit",
  );
});

test("差し戻し・本人だが実行者ロールなし → null", () => {
  expect(
    approvalAction(detail({ approvalStatus: "rejected" }), me(EXECUTOR, ["approver"])),
  ).toBeNull();
});

test("差し戻し・承認者（別人） → null", () => {
  expect(
    approvalAction(detail({ approvalStatus: "rejected" }), me(OTHER, ["approver", "executor"])),
  ).toBeNull();
});

test("承認済み・実行中・中止 → null", () => {
  const reviewer = me(OTHER, ["approver"]);
  const owner = me(EXECUTOR, ["executor"]);
  for (const d of [
    detail({ approvalStatus: "approved" }),
    detail({ status: "running", approvalStatus: null }),
    detail({ status: "cancelled", approvalStatus: null }),
  ]) {
    expect(approvalAction(d, reviewer)).toBeNull();
    expect(approvalAction(d, owner)).toBeNull();
  }
});
