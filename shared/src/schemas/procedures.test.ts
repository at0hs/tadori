import { describe, expect, it } from "vitest";
import { newId } from "../ids.ts";
import {
  draftLockSchema,
  findPublishErrors,
  type ProcedureContent,
  type ProcedureStep,
  type ProcedureVariable,
  procedureContentSchema,
  publishRequestSchema,
} from "./procedures.ts";

const step = (o: Partial<ProcedureStep> = {}): ProcedureStep => ({
  id: newId(),
  title: "設定ファイルのバックアップ",
  description: "",
  command: "ssh #{host} sudo cp a b",
  verification: "",
  evidenceRequired: false,
  ...o,
});
const v = (name: string, o: Partial<ProcedureVariable> = {}): ProcedureVariable => ({
  name,
  description: "",
  default: null,
  secret: false,
  ...o,
});
const content = (o: Partial<ProcedureContent> = {}): ProcedureContent => ({
  title: "nginx の設定変更",
  summary: "",
  tags: ["nginx"],
  prerequisites: "",
  variables: [v("host", { default: "web01.example.test" })],
  steps: [step()],
  rollbackSteps: [],
  ...o,
});
const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : (r.error?.issues ?? []).map((i) => i.path.join("."));

describe("F-02: 保存時の検証", () => {
  it("正しい文書は通る", () => {
    expect(procedureContentSchema.safeParse(content()).success).toBe(true);
  });

  it("F-02 AC: タイトルのない手順書は保存できない", () => {
    const r = procedureContentSchema.safeParse(content({ title: "  " }));
    expect(paths(r)).toEqual(["title"]);
    expect(r.error?.issues[0]?.message).toBe("タイトルを入力してください。");
  });

  it("F-02 AC: タイトルのないステップは保存できない", () => {
    expect(
      paths(procedureContentSchema.safeParse(content({ steps: [step({ title: "" })] }))),
    ).toEqual(["steps.0.title"]);
  });

  it("大文字小文字だけが違う変数名は、後の方をエラーにする", () => {
    const r = procedureContentSchema.safeParse(content({ variables: [v("host"), v("Host")] }));
    expect(paths(r)).toEqual(["variables.1.name"]);
  });

  it("規則に合わない変数名はエラー", () => {
    expect(paths(procedureContentSchema.safeParse(content({ variables: [v("1host")] })))).toEqual([
      "variables.0.name",
    ]);
  });

  it("D-26: 秘密変数は既定値を持てない", () => {
    const r = procedureContentSchema.safeParse(
      content({ variables: [v("pw", { secret: true, default: "x" })] }),
    );
    expect(paths(r)).toEqual(["variables.0.default"]);
  });

  it("タグは重複できない", () => {
    expect(paths(procedureContentSchema.safeParse(content({ tags: ["web", "web"] })))).toEqual([
      "tags",
    ]);
  });

  it("ステップの id は手順と切り戻しを通して一意", () => {
    const s = step();
    expect(
      paths(procedureContentSchema.safeParse(content({ steps: [s], rollbackSteps: [s] }))),
    ).toEqual(["rollbackSteps.0.id"]);
  });

  it("タイトルの前後の空白は除く", () => {
    expect(procedureContentSchema.parse(content({ title: "  a  " })).title).toBe("a");
  });
});

describe("F-02: 公開時の検証", () => {
  it("F-02 AC: 未定義の変数を参照していると公開時にエラー（大文字小文字を区別、同じ欄では1つ）", () => {
    expect(
      findPublishErrors(content({ steps: [step({ command: "ssh #{Host} #{Host}" })] })),
    ).toEqual([{ path: "steps.0.command", message: "未定義の変数 #{Host} を参照しています。" }]);
  });

  it("切り戻しのステップのタイトルも調べる", () => {
    expect(
      findPublishErrors(
        content({ variables: [], rollbackSteps: [step({ title: "#{x} を戻す", command: "" })] }),
      ),
    ).toContainEqual({
      path: "rollbackSteps.0.title",
      message: "未定義の変数 #{x} を参照しています。",
    });
  });

  it("エスケープと対象外の欄はエラーにしない", () => {
    expect(
      findPublishErrors(
        content({
          variables: [],
          prerequisites: "#{x}",
          summary: "#{x}",
          steps: [step({ description: "##{x}", command: "" })],
        }),
      ),
    ).toEqual([]);
  });

  it("説明・確認方法も調べる", () => {
    const errs = findPublishErrors(
      content({
        variables: [],
        steps: [step({ description: "#{a}", verification: "#{b}", command: "" })],
      }),
    );
    expect(errs.map((e) => e.path)).toEqual(["steps.0.description", "steps.0.verification"]);
  });

  it("F-02 AC: 手順のステップが0件なら公開できない", () => {
    expect(findPublishErrors(content({ steps: [] }))).toEqual([
      { path: "steps", message: "公開するには、手順のステップが1つ以上必要です。" },
    ]);
  });
});

describe("要求の形", () => {
  it("lock は revision か、revision: null と版数", () => {
    expect(draftLockSchema.safeParse({ revision: 2 }).success).toBe(true);
    expect(draftLockSchema.safeParse({ revision: null, versionNo: 1 }).success).toBe(true);
    expect(draftLockSchema.safeParse({ revision: null }).success).toBe(false);
  });

  it("F-03: 公開には変更理由が必須", () => {
    const r = publishRequestSchema.safeParse({
      content: content(),
      lock: { revision: 1 },
      changeReason: " ",
    });
    expect(paths(r)).toEqual(["changeReason"]);
    expect(r.error?.issues[0]?.message).toBe("変更理由を入力してください。");
  });
});
