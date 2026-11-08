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

const me = (id: string, role: Role): MeResponse => ({
  id,
  name: "誰か",
  username: "someone",
  role,
  mustChangePassword: false,
});

test("承認待ち・承認者・実行者でない → review", () => {
  expect(approvalAction(detail({}), me(OTHER, "approver"))).toBe("review");
});

test("承認待ち・管理者・実行者でない → review（D-64）", () => {
  expect(approvalAction(detail({}), me(OTHER, "admin"))).toBe("review");
});

test("承認待ち・承認者だが自分の実行 → null（職務分離）", () => {
  expect(approvalAction(detail({}), me(EXECUTOR, "approver"))).toBeNull();
});

test("承認待ち・作業者 → null", () => {
  expect(approvalAction(detail({}), me(OTHER, "worker"))).toBeNull();
});

test("差し戻し・本人（作業者） → resubmit", () => {
  expect(approvalAction(detail({ approvalStatus: "rejected" }), me(EXECUTOR, "worker"))).toBe(
    "resubmit",
  );
});

test("差し戻し・本人（承認者）→ resubmit（承認は出さない）", () => {
  expect(approvalAction(detail({ approvalStatus: "rejected" }), me(EXECUTOR, "approver"))).toBe(
    "resubmit",
  );
});

test("差し戻し・本人だが閲覧者に下げられた → null", () => {
  expect(approvalAction(detail({ approvalStatus: "rejected" }), me(EXECUTOR, "viewer"))).toBeNull();
});

test("差し戻し・承認者（別人） → null", () => {
  expect(approvalAction(detail({ approvalStatus: "rejected" }), me(OTHER, "approver"))).toBeNull();
});

test("閲覧者には何も出さない", () => {
  expect(approvalAction(detail({}), me(OTHER, "viewer"))).toBeNull();
});

test("承認済み・実行中・中止 → null", () => {
  const reviewer = me(OTHER, "approver");
  const owner = me(EXECUTOR, "worker");
  for (const d of [
    detail({ approvalStatus: "approved" }),
    detail({ status: "running", approvalStatus: null }),
    detail({ status: "cancelled", approvalStatus: null }),
  ]) {
    expect(approvalAction(d, reviewer)).toBeNull();
    expect(approvalAction(d, owner)).toBeNull();
  }
});
