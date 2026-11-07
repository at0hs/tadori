import { newId, type ProcedureContent, type ProcedureStep } from "@tadori/shared";
import type { FieldError } from "@/lib/api.ts";

// 編集画面のフォームの値とエラーの扱い（ui.md 7.5）。画面の部品に依らない部分。

export function emptyStep(): ProcedureStep {
  return {
    id: newId(),
    title: "",
    description: "",
    command: "",
    verification: "",
    evidenceRequired: false,
  };
}

export function emptyContent(): ProcedureContent {
  return {
    title: "",
    summary: "",
    tags: [],
    prerequisites: "",
    variables: [],
    steps: [],
    rollbackSteps: [],
  };
}

/** API のエラーの位置（本文の中の位置、conventions.md 3.1）を、フォームの欄の名前にする。 */
export function toFormPath(apiPath: string): string {
  return apiPath.startsWith("content.") ? apiPath.slice("content.".length) : apiPath;
}

const LIST_LABELS = { steps: "手順", rollbackSteps: "切り戻し手順" } as const;

/** エラーの場所の名前（「手順 3「…」」「基本情報」など）。帯の一覧に出す。 */
function labelOf(path: string, content: ProcedureContent): string {
  const [head, index] = path.split(".");
  if (head === "steps" || head === "rollbackSteps") {
    const name = LIST_LABELS[head];
    if (index === undefined) return name;
    const step = content[head][Number(index)];
    const title = step?.title.trim();
    return title ? `${name} ${Number(index) + 1}「${title}」` : `${name} ${Number(index) + 1}`;
  }
  if (head === "variables") return index === undefined ? "変数" : `変数 ${Number(index) + 1}`;
  if (head === "prerequisites") return "前提条件";
  return "基本情報";
}

export type ErrorRow = { path: string; label: string; message: string };

export function errorSummary(errors: FieldError[], content: ProcedureContent): ErrorRow[] {
  return errors.map((e) => ({ path: e.path, label: labelOf(e.path, content), message: e.message }));
}
