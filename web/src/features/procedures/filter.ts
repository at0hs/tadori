import type { ProcedureSummary } from "@tadori/shared";

// S-04 の件数のカードと絞り込み・並べ替え（ui.md 7.2）。絞り込みは画面で行う（D-16）。
export const PROCEDURE_STATUS_FILTERS = ["all", "editing", "unpublished", "archived"] as const;
export type ProcedureStatusFilter = (typeof PROCEDURE_STATUS_FILTERS)[number];
export const PROCEDURE_SORTS = ["published", "title"] as const;
export type ProcedureSort = (typeof PROCEDURE_SORTS)[number];

export type ProcedureFilter = {
  q: string;
  tags: readonly string[];
  status: ProcedureStatusFilter;
  sort: ProcedureSort;
};

function matchesStatus(p: ProcedureSummary, status: ProcedureStatusFilter): boolean {
  // 「すべて」はアーカイブを除く（screens.md S-04）
  return status === "all" ? p.status !== "archived" : p.status === status;
}

export function procedureCounts(list: ProcedureSummary[]): Record<ProcedureStatusFilter, number> {
  return {
    all: list.filter((p) => matchesStatus(p, "all")).length,
    editing: list.filter((p) => matchesStatus(p, "editing")).length,
    unpublished: list.filter((p) => matchesStatus(p, "unpublished")).length,
    archived: list.filter((p) => matchesStatus(p, "archived")).length,
  };
}

/**
 * q は前後の空白を除き、タイトルの部分一致（大文字と小文字を区別しない）。tags は全部を含むもの。
 * 並べ替えは、最終公開日時の新しい順（未公開は最後）かタイトル順。
 */
export function filterProcedures(list: ProcedureSummary[], f: ProcedureFilter): ProcedureSummary[] {
  const q = f.q.trim().toLowerCase();
  const shown = list.filter(
    (p) =>
      matchesStatus(p, f.status) &&
      (q === "" || p.title.toLowerCase().includes(q)) &&
      f.tags.every((t) => p.tags.includes(t)),
  );
  return shown.sort((a, b) =>
    f.sort === "title"
      ? a.title.localeCompare(b.title, "ja")
      : (b.lastPublishedAt ?? "").localeCompare(a.lastPublishedAt ?? ""),
  );
}
