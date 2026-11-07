import { describe, expect, it } from "vitest";
import {
  finishOutcome,
  progressOf,
  type StepStatus,
  startExecutionRequestSchema,
  stepStatusChangeRequestSchema,
} from "./executions.ts";

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : (r.error?.issues ?? []).map((i) => i.path.join("."));

const steps = (main: StepStatus[], rollback: StepStatus[]) => [
  ...main.map((status) => ({ section: "main" as const, status })),
  ...rollback.map((status) => ({ section: "rollback" as const, status })),
];

describe("finishOutcome（state-transitions.md 3.3）", () => {
  it.each([
    ["すべて完了", ["done", "done", "done"], ["pending", "pending"], "completed"],
    ["不要な手順をスキップ", ["done", "skipped", "done"], ["pending", "pending"], "completed"],
    ["途中で失敗して切り戻した", ["done", "failed", "pending"], ["done", "done"], "abnormal"],
    ["失敗を再実行して成功した", ["done", "done", "done"], ["pending", "pending"], "completed"],
    ["切り戻しの途中で失敗した", ["done", "failed", "pending"], ["done", "failed"], "abnormal"],
    ["途中でやめたい", ["done", "pending", "pending"], ["pending", "pending"], null],
  ] as const)("%s", (_, main, rollback, expected) => {
    expect(finishOutcome(steps([...main], [...rollback]))).toBe(expected);
  });

  it("切り戻しがスキップだけなら異常終了にならない", () => {
    expect(finishOutcome(steps(["done"], ["skipped"]))).toBe("completed");
  });

  it("切り戻しを実施していれば、手順に未実施が残っていても異常終了", () => {
    expect(finishOutcome(steps(["pending"], ["done"]))).toBe("abnormal");
  });
});

describe("progressOf（D-57）", () => {
  it("手順だけを数え、完了とスキップを完了数にする", () => {
    expect(progressOf(steps(["done", "skipped", "failed", "pending"], ["done"]))).toEqual({
      done: 2,
      total: 4,
    });
  });
});

describe("stepStatusChangeRequestSchema", () => {
  it("同じ状態への変更は to にエラー", () => {
    const r = stepStatusChangeRequestSchema.safeParse({
      from: "done",
      to: "done",
      skipReason: null,
    });
    expect(paths(r)).toEqual(["to"]);
  });

  it("スキップで理由が空白だけなら skipReason にエラー", () => {
    const r = stepStatusChangeRequestSchema.safeParse({
      from: "pending",
      to: "skipped",
      skipReason: "  ",
    });
    expect(paths(r)).toEqual(["skipReason"]);
    const r2 = stepStatusChangeRequestSchema.safeParse({
      from: "pending",
      to: "skipped",
      skipReason: null,
    });
    expect(paths(r2)).toEqual(["skipReason"]);
  });

  it("スキップ以外は理由なしで通る", () => {
    const r = stepStatusChangeRequestSchema.safeParse({
      from: "pending",
      to: "done",
      skipReason: null,
    });
    expect(r.success).toBe(true);
  });

  it("スキップの理由は前後の空白を取り除く", () => {
    const r = stepStatusChangeRequestSchema.parse({
      from: "pending",
      to: "skipped",
      skipReason: " 対象外 ",
    });
    expect(r.skipReason).toBe("対象外");
  });
});

describe("startExecutionRequestSchema", () => {
  const base = {
    procedureId: "0190f0a0-0000-7000-8000-000000000000",
    versionNo: 1,
  };

  it("値が空文字なら variables.<name> にエラー", () => {
    const r = startExecutionRequestSchema.safeParse({ ...base, variables: { host: "" } });
    expect(paths(r)).toEqual(["variables.host"]);
  });

  it("規則に合わない名前のキーは通らない", () => {
    const r = startExecutionRequestSchema.safeParse({ ...base, variables: { "1bad": "x" } });
    expect(r.success).toBe(false);
  });

  it("正しい値は通る", () => {
    const r = startExecutionRequestSchema.safeParse({
      ...base,
      variables: { host: "web01.example.test" },
    });
    expect(r.success).toBe(true);
  });
});
