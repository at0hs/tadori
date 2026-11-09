import type { ProcedureContent, ProcedureStep } from "@tadori/shared";
import { describe, expect, it } from "vitest";
import { diffProcedure, isChanged, lineDiff, textDiff } from "./compute.ts";

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
  summary: "",
  tags: [],
  prerequisites: "",
  variables: [],
  steps: [],
  rollbackSteps: [],
  ...over,
});

const A = step("a");
const B = step("b");
const C = step("c");
const D = step("d");
const E = step("e");

describe("textDiff", () => {
  it("日本語の文でも、部品をつなぐと前後の文に戻る", () => {
    const a = "設定を再読み込みする";
    const b = "設定を再読み込みして worker 数を確かめる";
    const parts = textDiff(a, b);
    expect(
      parts
        .filter((p) => p.kind !== "add")
        .map((p) => p.text)
        .join(""),
    ).toBe(a);
    expect(
      parts
        .filter((p) => p.kind !== "del")
        .map((p) => p.text)
        .join(""),
    ).toBe(b);
    expect(parts[0]).toMatchObject({ kind: "same" });
    expect(parts[0]?.text.startsWith("設定を")).toBe(true);
  });
  it.each([
    ["ls -la", "ls -la "],
    ["a b", "a  b"],
    ["a\nb", "a\n\nb"],
    ["東京都の サーバー", "東京都のサーバー"],
    ["  a", "a"],
  ])("空白だけの違いも部品に残り、前後の文に戻る（%j → %j）", (a, b) => {
    const parts = textDiff(a, b);
    const join = (skip: string) =>
      parts
        .filter((p) => p.kind !== skip)
        .map((p) => p.text)
        .join("");
    expect(join("add")).toBe(a);
    expect(join("del")).toBe(b);
    expect(isChanged(parts)).toBe(true);
  });
  it("同じ文なら same が1つ、空同士なら空配列", () => {
    expect(textDiff("同じ", "同じ")).toEqual([{ kind: "same", text: "同じ" }]);
    expect(textDiff("", "")).toEqual([]);
  });
});

describe("lineDiff", () => {
  it("変わった行だけ del と add になり、対の行には行の中の違いが入る", () => {
    const lines = lineDiff(
      "ssh #{host} sudo sed -i \\\n  /etc/nginx/nginx.conf",
      "ssh #{host} sudo sed -i.orig \\\n  /etc/nginx/nginx.conf",
    );
    expect(lines.map((l) => l.kind)).toEqual(["del", "add", "same"]);
    expect(lines[1]?.parts.some((p) => p.kind === "add" && p.text.includes(".orig"))).toBe(true);
    expect(lines[2]?.parts).toEqual([{ kind: "same", text: "  /etc/nginx/nginx.conf" }]);
  });
  it("行の中の空白だけが違っても、削除の行は前の文、追加の行は後の文になる", () => {
    const lines = lineDiff("ls -la", "ls  -la");
    const text = (i: number) => lines[i]?.parts.map((p) => p.text).join("");
    expect(lines.map((l) => l.kind)).toEqual(["del", "add"]);
    expect(text(0)).toBe("ls -la");
    expect(text(1)).toBe("ls  -la");
  });
  it("末尾の改行だけが違っても違いとして出る", () => {
    expect(isChanged(lineDiff("echo ok\n", "echo ok"))).toBe(true);
  });
  it("同じなら違いなし、空同士なら空配列", () => {
    expect(isChanged(lineDiff("a\nb", "a\nb"))).toBe(false);
    expect(lineDiff("", "")).toEqual([]);
  });
  it("前後の行を足すと、足した行だけ add", () => {
    const lines = lineDiff("b", "a\nb\nc");
    expect(lines.map((l) => [l.kind, l.parts.map((p) => p.text).join("")])).toEqual([
      ["add", "a"],
      ["same", "b"],
      ["add", "c"],
    ]);
  });
});

describe("diffProcedure：ステップ", () => {
  // 最新版 [a, b, c, d]、下書き [c, b(タイトル変更), d, e(追加)]、a は削除
  it("ID で突き合わせ、追加・削除・変更・移動を決める", () => {
    const d = diffProcedure(
      content({ steps: [A, B, C, D] }),
      content({ steps: [C, { ...B, title: "新しい題" }, D, E] }),
    );
    expect(d.steps.map((s) => [s.id, s.status, s.moved, s.oldNo, s.newNo])).toEqual([
      [C.id, "same", true, 3, 1],
      [A.id, "del", false, 1, null],
      [B.id, "mod", false, 2, 2],
      [D.id, "same", false, 4, 3],
      [E.id, "add", false, null, 4],
    ]);
  });
  it("前に足しただけで番号がずれたステップは移動にしない", () => {
    const d = diffProcedure(content({ steps: [A, B] }), content({ steps: [E, A, B] }));
    expect(d.steps.filter((s) => s.moved)).toEqual([]);
  });
  it("2つを入れ替えたら、移動は1つだけ", () => {
    const d = diffProcedure(content({ steps: [A, B] }), content({ steps: [B, A] }));
    expect(d.steps.filter((s) => s.moved)).toHaveLength(1);
  });
  it("F-11 AC: 1番目と3番目を入れ替えたら、その2つが移動で、間のステップは移動にしない（受入テスト P-7）", () => {
    const d = diffProcedure(
      content({ steps: [A, B, C] }),
      content({ steps: [C, { ...B, title: "新しい題" }, A] }),
    );
    expect(d.steps.map((s) => [s.id, s.status, s.moved, s.oldNo, s.newNo])).toEqual([
      [C.id, "same", true, 3, 1],
      [B.id, "mod", false, 2, 2],
      [A.id, "same", true, 1, 3],
    ]);
  });
  it("1番目と4番目を入れ替えたら、その2つだけが移動", () => {
    const d = diffProcedure(content({ steps: [A, B, C, D] }), content({ steps: [D, B, C, A] }));
    expect(d.steps.filter((s) => s.moved).map((s) => s.id)).toEqual([D.id, A.id]);
  });
  it("1つを先頭へ動かしたら、動かしたものだけが移動", () => {
    const d = diffProcedure(content({ steps: [A, B, C, D] }), content({ steps: [D, A, B, C] }));
    expect(d.steps.filter((s) => s.moved).map((s) => s.id)).toEqual([D.id]);
  });
  it("エビデンス必須だけを変えても mod、前後の値を持つ", () => {
    const d = diffProcedure(
      content({ steps: [A] }),
      content({ steps: [{ ...A, evidenceRequired: true }] }),
    );
    expect(d.steps[0]).toMatchObject({
      status: "mod",
      evidenceRequired: { before: false, after: true },
    });
  });
  it("手順を全部消すと全部が削除、空だった切り戻しに足すと追加", () => {
    const d = diffProcedure(content({ steps: [A, B] }), content({ steps: [], rollbackSteps: [E] }));
    expect(d.steps.map((s) => s.status)).toEqual(["del", "del"]);
    expect(d.rollbackSteps.map((s) => s.status)).toEqual(["add"]);
    expect(d.rollbackSteps[0]?.evidenceRequired).toEqual({ before: null, after: false });
    expect(d.steps[0]?.evidenceRequired).toEqual({ before: false, after: null });
  });
  it("連続した削除は最新版の順を保つ", () => {
    const d = diffProcedure(content({ steps: [A, B, C, D] }), content({ steps: [A, D] }));
    expect(d.steps.map((s) => [s.id, s.status])).toEqual([
      [A.id, "same"],
      [B.id, "del"],
      [C.id, "del"],
      [D.id, "same"],
    ]);
  });
});

describe("diffProcedure：変数・タグ・全体", () => {
  it("名前を変えた変数は旧名の削除と新名の追加、秘密かどうかだけの変更は mod", () => {
    const host = {
      name: "host",
      description: "対象",
      default: "web01.example.test",
      secret: false,
    };
    const pw = { name: "pw", description: "", default: null, secret: false };
    const d = diffProcedure(
      content({ variables: [host, pw] }),
      content({
        variables: [
          { ...host, name: "target" },
          { ...pw, secret: true },
        ],
      }),
    );
    expect(d.variables.map((v) => [v.name, v.status])).toEqual([
      ["target", "add"],
      ["host", "del"],
      ["pw", "mod"],
    ]);
  });
  it("タグは下書きの順、消えたタグは後ろ", () => {
    const d = diffProcedure(
      content({ tags: ["nginx", "定期作業"] }),
      content({ tags: ["監視", "nginx"] }),
    );
    expect(d.tags).toEqual([
      { tag: "監視", kind: "add" },
      { tag: "nginx", kind: "same" },
      { tag: "定期作業", kind: "del" },
    ]);
  });
  it("同じ文書なら changed は false", () => {
    const c = content({ steps: [A, B], variables: [] });
    expect(diffProcedure(c, structuredClone(c)).changed).toBe(false);
  });
  it("概要の空白だけを変えても changed は true", () => {
    expect(diffProcedure(content({ summary: "a b" }), content({ summary: "a  b" })).changed).toBe(
      true,
    );
  });
  it("移動だけでも changed は true", () => {
    expect(diffProcedure(content({ steps: [A, B] }), content({ steps: [B, A] })).changed).toBe(
      true,
    );
  });
});
