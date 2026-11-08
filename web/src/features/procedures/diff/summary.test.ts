import type { ProcedureContent, ProcedureStep } from "@tadori/shared";
import { describe, expect, it } from "vitest";
import { diffProcedure } from "./compute.ts";
import { summarizeDiff, summaryRows, summaryText } from "./summary.ts";

let seq = 0;
const step = (title: string, over: Partial<ProcedureStep> = {}): ProcedureStep => {
  seq += 1;
  return {
    id: `00000000-0000-7000-8000-${String(seq).padStart(12, "0")}`,
    title,
    description: "",
    command: "",
    verification: "",
    evidenceRequired: false,
    ...over,
  };
};

const content = (over: Partial<ProcedureContent> = {}): ProcedureContent => ({
  title: "nginx の設定変更",
  summary: "nginx の設定を変える",
  tags: ["nginx"],
  prerequisites: "作業の連絡をする",
  variables: [{ name: "workers", description: "worker 数", default: "4", secret: false }],
  steps: [],
  rollbackSteps: [],
  ...over,
});

const S1 = step("設定を退避する");
const S2 = step("設定を書き換える", { command: "sed -i" });
const S3 = step("設定を確かめる");
const S4 = step("再読み込みする");
const S5 = step("監視を確かめる");
const R1 = step("設定を戻す");

// モックアップと同じ形：S4 を前へ動かして変更、S3 を削除、S2 を変更、S5 を追加、切り戻しに R1 を追加
const base = content({ steps: [S1, S2, S3, S4] });
const draft = content({
  summary: "nginx の設定を変え、worker 数を確かめる",
  tags: ["nginx", "定期作業"],
  prerequisites: "作業の連絡をする\n監視を止める",
  variables: [{ name: "workers", description: "worker 数", default: "8", secret: false }],
  steps: [{ ...S4, title: "設定を再読み込みする" }, S1, { ...S2, command: "sed -i.orig" }, S5],
  rollbackSteps: [R1],
});
const MOCK = diffProcedure(base, draft);
const ONLY_STEP_MOD = diffProcedure(
  content({ steps: [S1] }),
  content({ steps: [{ ...S1, title: "退避する" }] }),
);
const NO_CHANGE = diffProcedure(base, structuredClone(base));

describe("summarizeDiff", () => {
  it("数を区画ごとに数える。mod は中身が違うものだけ、moved は別に数える", () => {
    expect(summarizeDiff(MOCK)).toEqual({
      basic: ["概要", "タグ"],
      prerequisites: { add: 1, del: 0 },
      variables: { add: 0, del: 0, mod: 1 },
      steps: { add: 1, del: 1, mod: 2, moved: 1 },
      rollbackSteps: { add: 1, del: 0, mod: 0, moved: 0 },
    });
  });
  it("右の欄の行", () => {
    expect(summaryRows(summarizeDiff(MOCK))).toEqual([
      ["基本情報", "概要・タグ"],
      ["前提条件", "1行追加"],
      ["変数", "変更 1"],
      ["手順", "追加 1・削除 1・変更 2・移動 1"],
      ["切り戻し手順", "追加 1"],
    ]);
  });
  it("前提条件の追加と削除は「・」でつなぐ", () => {
    const d = diffProcedure(content(), content({ prerequisites: "a\nb" }));
    expect(summaryRows(summarizeDiff(d))).toEqual([["前提条件", "2行追加・1行削除"]]);
  });
  it("ダイアログの1行", () => {
    expect(summaryText(summarizeDiff(MOCK))).toBe(
      "手順：追加 1・削除 1・変更 2・移動 1／切り戻し手順：追加 1／ほかに基本情報・前提条件・変数",
    );
  });
  it("手順だけが変わったときは「ほかに」を付けない。何も変わらなければ空文字", () => {
    expect(summaryText(summarizeDiff(ONLY_STEP_MOD))).toBe("手順：変更 1");
    expect(summaryText(summarizeDiff(NO_CHANGE))).toBe("");
    expect(summaryRows(summarizeDiff(NO_CHANGE))).toEqual([]);
  });
  it("手順が変わらず、ほかだけが変わったときは「ほかに」を付けない", () => {
    const d = diffProcedure(content(), content({ title: "新しい題" }));
    expect(summaryText(summarizeDiff(d))).toBe("基本情報");
  });
});
