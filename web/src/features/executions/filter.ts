import type { ApprovalStatus, ExecutionStatus, ExecutionSummary } from "@tadori/shared";

// S-11 の件数のカードと絞り込み・並べ替え（ui.md 8.3）。絞り込みは画面で行う（D-16）。
export const EXECUTION_LIST_FILTERS = ["all", "running", "pending", "rejected"] as const;
export type ExecutionListFilter = (typeof EXECUTION_LIST_FILTERS)[number];
export const EXECUTION_SORTS = ["updated", "started"] as const;
export type ExecutionSort = (typeof EXECUTION_SORTS)[number];

export type ExecutionFilter = {
  card: ExecutionListFilter;
  status: readonly ExecutionStatus[];
  approval?: ApprovalStatus;
  procedure?: string;
  executor?: string;
  sort: ExecutionSort;
};

function matchesCard(e: ExecutionSummary, card: ExecutionListFilter): boolean {
  switch (card) {
    case "all":
      return true;
    case "running":
      return e.status === "running";
    case "pending":
      return e.approvalStatus === "pending";
    case "rejected":
      return e.approvalStatus === "rejected";
  }
}

/** 手順書と実行者の絞り込み（件数のカードにも効かせる） */
export type ExecutionScope = { procedure?: string; executor?: string };

function inScope(e: ExecutionSummary, scope: ExecutionScope): boolean {
  return (
    (scope.procedure === undefined || e.procedure.id === scope.procedure) &&
    (scope.executor === undefined || e.executor.id === scope.executor)
  );
}

/** 件数のカード。手順書と実行者の絞り込みだけは効かせる（S-05・ホームから来たとき） */
export function executionCounts(
  list: ExecutionSummary[],
  scope: ExecutionScope,
): Record<ExecutionListFilter, number> {
  const scoped = list.filter((e) => inScope(e, scope));
  return {
    all: scoped.length,
    running: scoped.filter((e) => matchesCard(e, "running")).length,
    pending: scoped.filter((e) => matchesCard(e, "pending")).length,
    rejected: scoped.filter((e) => matchesCard(e, "rejected")).length,
  };
}

/** status は複数の OR。並べ替えは最終更新か開始日時の新しい順 */
export function filterExecutions(list: ExecutionSummary[], f: ExecutionFilter): ExecutionSummary[] {
  const shown = list.filter(
    (e) =>
      matchesCard(e, f.card) &&
      (f.status.length === 0 || f.status.includes(e.status)) &&
      (f.approval === undefined || e.approvalStatus === f.approval) &&
      inScope(e, f),
  );
  const key = f.sort === "started" ? "startedAt" : "updatedAt";
  return shown.sort((a, b) => b[key].localeCompare(a[key]));
}
