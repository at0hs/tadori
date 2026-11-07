import type { ExecutionSummary } from "@tadori/shared";
import { expect, test } from "vitest";
import { type ExecutionFilter, executionCounts, filterExecutions } from "./filter.ts";

const user = { id: "01970000-0000-7000-8000-0000000000a1", name: "実行 太郎" };
const e = (o: Partial<ExecutionSummary> & { id: string }): ExecutionSummary => ({
  procedure: { id: "p1", title: "手順書 A" },
  versionNo: 1,
  executor: user,
  status: "running",
  approvalStatus: null,
  progress: { done: 0, total: 3 },
  startedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...o,
});

const list = [
  e({ id: "run", updatedAt: "2026-11-05T00:00:00.000Z", startedAt: "2026-11-01T00:00:00.000Z" }),
  e({
    id: "pending",
    status: "completed",
    approvalStatus: "pending",
    updatedAt: "2026-11-04T00:00:00.000Z",
    startedAt: "2026-11-03T00:00:00.000Z",
  }),
  e({
    id: "rejected",
    status: "abnormal",
    approvalStatus: "rejected",
    procedure: { id: "p2", title: "手順書 B" },
    updatedAt: "2026-11-06T00:00:00.000Z",
    startedAt: "2026-11-02T00:00:00.000Z",
  }),
  e({
    id: "cancelled",
    status: "cancelled",
    procedure: { id: "p2", title: "手順書 B" },
    updatedAt: "2026-11-02T00:00:00.000Z",
    startedAt: "2026-11-02T01:00:00.000Z",
  }),
];
const ids = (xs: ExecutionSummary[]) => xs.map((x) => x.id);
const base: ExecutionFilter = { card: "all", status: [], sort: "updated" };

test("既定は最終更新の新しい順", () => {
  expect(ids(filterExecutions(list, base))).toEqual(["rejected", "run", "pending", "cancelled"]);
});

test("開始日時の新しい順", () => {
  expect(ids(filterExecutions(list, { ...base, sort: "started" }))).toEqual([
    "pending",
    "cancelled",
    "rejected",
    "run",
  ]);
});

test("カード：実行中・承認待ち・差し戻し", () => {
  expect(ids(filterExecutions(list, { ...base, card: "running" }))).toEqual(["run"]);
  expect(ids(filterExecutions(list, { ...base, card: "pending" }))).toEqual(["pending"]);
  expect(ids(filterExecutions(list, { ...base, card: "rejected" }))).toEqual(["rejected"]);
});

test("status は複数の OR", () => {
  expect(ids(filterExecutions(list, { ...base, status: ["completed", "abnormal"] }))).toEqual([
    "rejected",
    "pending",
  ]);
});

test("approval と procedure", () => {
  expect(ids(filterExecutions(list, { ...base, approval: "pending" }))).toEqual(["pending"]);
  expect(ids(filterExecutions(list, { ...base, procedure: "p2" }))).toEqual([
    "rejected",
    "cancelled",
  ]);
});

test("件数のカード（手順書の絞り込みは効かせる）", () => {
  expect(executionCounts(list)).toEqual({ all: 4, running: 1, pending: 1, rejected: 1 });
  expect(executionCounts(list, "p2")).toEqual({ all: 2, running: 0, pending: 0, rejected: 1 });
});
