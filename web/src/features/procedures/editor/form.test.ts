import type { ProcedureContent } from "@tadori/shared";
import { describe, expect, it } from "vitest";
import { emptyContent, emptyStep, errorSummary, toFormPath } from "./form.ts";

const content: ProcedureContent = {
  ...emptyContent(),
  title: "nginx の設定変更",
  variables: [
    { name: "host", description: "", default: null, secret: false },
    { name: "Host", description: "", default: null, secret: false },
  ],
  steps: [
    { ...emptyStep(), title: "バックアップ" },
    { ...emptyStep(), title: "設定の書き換え" },
    { ...emptyStep(), title: "worker 数を書き換え" },
  ],
  rollbackSteps: [{ ...emptyStep(), title: "バックアップから戻す" }],
};

describe("toFormPath", () => {
  it("API の本文の位置から、フォームの欄の名前にする", () => {
    expect(toFormPath("content.steps.2.command")).toBe("steps.2.command");
    expect(toFormPath("content.title")).toBe("title");
    expect(toFormPath("changeReason")).toBe("changeReason");
  });
});

describe("errorSummary", () => {
  it("帯に出すエラーの場所の名前を付ける", () => {
    const rows = errorSummary(
      [
        { path: "steps.2.command", message: "未定義の変数 #{worker_num} を参照しています。" },
        { path: "rollbackSteps.0.command", message: "未定義の変数 #{hostname} を参照しています。" },
        { path: "title", message: "タイトルを入力してください。" },
        { path: "variables.1.name", message: "同じ名前の変数があります。" },
        { path: "steps", message: "公開するには、手順のステップが1つ以上必要です。" },
      ],
      content,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "手順 3「worker 数を書き換え」",
      "切り戻し手順 1「バックアップから戻す」",
      "基本情報",
      "変数 2",
      "手順",
    ]);
    expect(rows[0]).toMatchObject({
      path: "steps.2.command",
      message: "未定義の変数 #{worker_num} を参照しています。",
    });
  });

  it("タイトルのないステップは番号だけ", () => {
    const c = { ...content, steps: [{ ...emptyStep(), title: "" }] };
    expect(errorSummary([{ path: "steps.0.title", message: "x" }], c)[0]?.label).toBe("手順 1");
  });
});

describe("空の文書とステップ", () => {
  it("ステップの ID は UUID v7", () => {
    expect(emptyStep().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(emptyStep().id).not.toBe(emptyStep().id);
  });

  it("空の文書は手順も切り戻しも0件", () => {
    expect(emptyContent()).toMatchObject({ title: "", steps: [], rollbackSteps: [], tags: [] });
  });
});
