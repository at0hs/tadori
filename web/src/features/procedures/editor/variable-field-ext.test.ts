import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import type { ProcedureVariable } from "@tadori/shared";
import { describe, expect, it } from "vitest";
import { fixFullwidthOpen, variableCompletions } from "./variable-field-ext.ts";

const vars: ProcedureVariable[] = [
  { name: "host", description: "対象ホスト", default: "web01.example.test", secret: false },
  { name: "worker_count", description: "新しい worker 数", default: "4", secret: false },
  { name: "admin_password", description: "管理者パスワード", default: null, secret: true },
];

async function complete(doc: string, list = vars): Promise<CompletionResult | null> {
  const state = EditorState.create({ doc });
  const source = variableCompletions(() => list);
  return source(new CompletionContext(state, doc.length, false));
}
const labels = (r: CompletionResult | null) => r?.options.map((o) => o.label);

describe("D-58: 全角の「＃｛」を直す", () => {
  it("末尾の「＃｛」「#｛」「＃{」を「#{」に置き換える位置を返す", () => {
    expect(fixFullwidthOpen("ssh ＃｛")).toEqual({ from: 4, insert: "#{" });
    expect(fixFullwidthOpen("ssh #｛")).toEqual({ from: 4, insert: "#{" });
    expect(fixFullwidthOpen("ssh ＃{")).toEqual({ from: 4, insert: "#{" });
  });

  it("直す必要がなければ null", () => {
    expect(fixFullwidthOpen("ssh ＃")).toBeNull();
    expect(fixFullwidthOpen("ssh #{")).toBeNull();
    expect(fixFullwidthOpen("")).toBeNull();
  });
});

describe("D-06: #{ の入力補完", () => {
  it("#{ の後で、定義済みの変数をすべて出す", async () => {
    expect(labels(await complete("ssh #{"))).toEqual(["host", "worker_count", "admin_password"]);
  });

  it("名前の途中なら、その位置から補う", async () => {
    const r = await complete("ssh #{h");
    expect(r?.from).toBe(6);
    expect(labels(r)).toContain("host");
  });

  it("秘密変数は説明に（秘密）を添える", async () => {
    const r = await complete("#{");
    expect(r?.options.find((o) => o.label === "admin_password")?.detail).toBe(
      "管理者パスワード（秘密）",
    );
  });

  it("##{ はエスケープなので出さない", async () => {
    expect(await complete("ssh ##{")).toBeNull();
  });

  it("#{ がなければ出さない", async () => {
    expect(await complete("ssh host")).toBeNull();
  });

  it("変数がなければ出さない", async () => {
    expect(await complete("#{", [])).toBeNull();
  });

  it("確定すると name} を入れる", async () => {
    const r = await complete("ssh #{h");
    const option = r?.options.find((o) => o.label === "host");
    expect(option?.apply).toBe("host}");
  });
});
