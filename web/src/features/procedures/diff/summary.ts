import type { ProcedureDiff, StepDiff } from "./compute.ts";
import { isChanged } from "./compute.ts";

// 下書きの変更の要約（F-11、ui.md 10章）。S-17 の右の欄と、公開のダイアログに出す。

export type StepCounts = { add: number; del: number; mod: number; moved: number };
export type DiffSummary = {
  basic: ("タイトル" | "概要" | "タグ")[];
  /** 行の数 */
  prerequisites: { add: number; del: number };
  variables: { add: number; del: number; mod: number };
  steps: StepCounts;
  rollbackSteps: StepCounts;
};

function countSteps(steps: StepDiff[]): StepCounts {
  return {
    add: steps.filter((s) => s.status === "add").length,
    del: steps.filter((s) => s.status === "del").length,
    mod: steps.filter((s) => s.status === "mod").length,
    moved: steps.filter((s) => s.moved).length,
  };
}

export function summarizeDiff(diff: ProcedureDiff): DiffSummary {
  const basic: DiffSummary["basic"] = [];
  if (isChanged(diff.title)) basic.push("タイトル");
  if (isChanged(diff.summary)) basic.push("概要");
  if (diff.tags.some((t) => t.kind !== "same")) basic.push("タグ");
  return {
    basic,
    prerequisites: {
      add: diff.prerequisites.filter((l) => l.kind === "add").length,
      del: diff.prerequisites.filter((l) => l.kind === "del").length,
    },
    variables: {
      add: diff.variables.filter((v) => v.status === "add").length,
      del: diff.variables.filter((v) => v.status === "del").length,
      mod: diff.variables.filter((v) => v.status === "mod").length,
    },
    steps: countSteps(diff.steps),
    rollbackSteps: countSteps(diff.rollbackSteps),
  };
}

const counts = (pairs: [string, number][]) =>
  pairs
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join("・");

const stepText = (c: StepCounts) =>
  counts([
    ["追加", c.add],
    ["削除", c.del],
    ["変更", c.mod],
    ["移動", c.moved],
  ]);

function otherRows(s: DiffSummary): [string, string][] {
  const rows: [string, string][] = [];
  if (s.basic.length > 0) rows.push(["基本情報", s.basic.join("・")]);
  const pre = [
    s.prerequisites.add > 0 ? `${s.prerequisites.add}行追加` : "",
    s.prerequisites.del > 0 ? `${s.prerequisites.del}行削除` : "",
  ]
    .filter((t) => t !== "")
    .join("・");
  if (pre !== "") rows.push(["前提条件", pre]);
  const vars = counts([
    ["追加", s.variables.add],
    ["削除", s.variables.del],
    ["変更", s.variables.mod],
  ]);
  if (vars !== "") rows.push(["変数", vars]);
  return rows;
}

function stepRows(s: DiffSummary): [string, string][] {
  const rows: [string, string][] = [];
  const steps = stepText(s.steps);
  if (steps !== "") rows.push(["手順", steps]);
  const rollback = stepText(s.rollbackSteps);
  if (rollback !== "") rows.push(["切り戻し手順", rollback]);
  return rows;
}

/** 右の欄の1行ずつ。値が0の区画は出さない。例 ["手順", "追加 1・削除 1・変更 2・移動 1"] */
export function summaryRows(s: DiffSummary): [label: string, value: string][] {
  return [...otherRows(s), ...stepRows(s)];
}

/** ダイアログの1行。手順・切り戻し手順は数、残りは区画名を「ほかに」の後に並べる。 */
export function summaryText(s: DiffSummary): string {
  const steps = stepRows(s).map(([label, value]) => `${label}：${value}`);
  const others = otherRows(s).map(([label]) => label);
  if (others.length === 0) return steps.join("／");
  if (steps.length === 0) return others.join("・");
  return [...steps, `ほかに${others.join("・")}`].join("／");
}
