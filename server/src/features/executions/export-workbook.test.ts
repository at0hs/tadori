import { type ExecutionDetailResponse, newId } from "@tadori/shared";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { execContent } from "../../../test/executions.ts";
import { sampleStep } from "../../../test/procedures.ts";
import { readXlsx } from "../../../test/xlsx.ts";
import { buildWorkbook } from "./export-workbook.ts";

// Excel 出力のレイアウト（ui.md 8.9）。DB を使わず、手で作った詳細から組み立てて読み直す。
// セルは位置ではなく「ラベルの右」「明細の見出しの下」で引く（結合の仕方は実装に任せる）。

const user = (name: string) => ({ id: newId(), name });
const EXECUTOR = user("実行者A");
const APPROVER = user("承認者B");
const EXPORTED = { by: "管理者", at: new Date("2026-11-07T07:40:00.000Z") };

function fixture(overrides: Partial<ExecutionDetailResponse> = {}): ExecutionDetailResponse {
  const content = execContent({
    title: "Web サーバーの証明書更新",
    steps: [
      sampleStep({ title: "#{host} に接続", command: "ssh #{host} -p #{port}" }),
      sampleStep({
        title: "設定の反映",
        command: "echo #{admin_password} | sudo -S systemctl reload nginx",
      }),
      sampleStep({ title: "動作の確認", command: "" }),
    ],
  });
  const [s1, s2, s3, r1] = [...content.steps, ...content.rollbackSteps].map((s) => s.id) as [
    string,
    string,
    string,
    string,
  ];
  const step = (stepId: string, section: "main" | "rollback") => ({
    stepId,
    section,
    status: "pending" as const,
    skipReason: null,
    updatedBy: null,
    updatedAt: null,
    comments: [],
    evidences: [],
    history: [],
  });
  return {
    id: newId(),
    procedure: { id: newId(), title: content.title },
    versionNo: 3,
    content,
    executor: EXECUTOR,
    status: "completed",
    approvalStatus: "pending",
    startedAt: "2026-11-07T01:00:00.000Z",
    endedAt: "2026-11-07T02:30:00.000Z",
    updatedAt: "2026-11-07T02:30:00.000Z",
    cancelledBy: null,
    cancelReason: null,
    variables: { host: "web01.example.test", port: "22" },
    variablesLocked: true,
    steps: [
      {
        ...step(s1, "main"),
        status: "done",
        updatedBy: EXECUTOR,
        updatedAt: "2026-11-07T01:10:00.000Z",
      },
      {
        ...step(s2, "main"),
        status: "skipped",
        skipReason: "対象外のため",
        updatedBy: EXECUTOR,
        updatedAt: "2026-11-07T01:20:00.000Z",
        comments: [
          {
            id: newId(),
            body: "1件目",
            createdBy: EXECUTOR,
            createdAt: "2026-11-07T01:05:00.000Z",
          },
          {
            id: newId(),
            body: "2件目",
            createdBy: EXECUTOR,
            createdAt: "2026-11-07T01:06:00.000Z",
          },
        ],
        evidences: [
          {
            id: newId(),
            body: "OK ●●●●",
            createdBy: EXECUTOR,
            createdAt: "2026-11-07T01:07:00.000Z",
          },
        ],
      },
      step(s3, "main"),
      step(r1, "rollback"),
    ],
    approvals: [
      {
        kind: "requested",
        comment: null,
        actor: EXECUTOR,
        occurredAt: "2026-11-07T02:30:00.000Z",
      },
    ],
    ...overrides,
  };
}

const load = async (detail: ExecutionDetailResponse) =>
  readXlsx(await buildWorkbook(detail, EXPORTED));

async function sheetOf(detail: ExecutionDetailResponse) {
  const ws = (await load(detail)).worksheets[0];
  if (!ws) throw new Error("シートがない");
  return ws;
}

const text = (cell: ExcelJS.Cell) => (cell.value == null ? "" : String(cell.value));

function findCell(ws: ExcelJS.Worksheet, value: string): ExcelJS.Cell | undefined {
  let found: ExcelJS.Cell | undefined;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (!found && cell.value === value && (!cell.isMerged || cell.master === cell)) found = cell;
    });
  });
  return found;
}

/** ラベルの右にある値のセル（ラベルと同じ結合の範囲は飛ばす）。 */
function valueCell(ws: ExcelJS.Worksheet, label: string): ExcelJS.Cell {
  const cell = findCell(ws, label);
  if (!cell) throw new Error(`ラベル「${label}」がない`);
  const row = ws.getRow(Number(cell.row));
  for (let c = Number(cell.col) + 1; c <= ws.columnCount; c++) {
    const next = row.getCell(c);
    if (next.isMerged && next.master.address === cell.address) continue;
    return next.isMerged ? next.master : next;
  }
  throw new Error(`ラベル「${label}」の右にセルがない`);
}

function detailRows(ws: ExcelJS.Worksheet) {
  const header = findCell(ws, "No.");
  if (!header) throw new Error("明細の見出しがない");
  const headerRow = Number(header.row);
  const cols = ws.getRow(headerRow).values as unknown[];
  const colOf = (name: string) => cols.indexOf(name);
  const rows: ExcelJS.Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.getCell(1).value != null) rows.push(row);
  }
  /** 明細の i 行目（0から）の列 name のセル。 */
  const at = (i: number, name: string) => {
    const row = rows[i];
    if (!row) throw new Error(`明細の ${i} 行目がない`);
    return row.getCell(colOf(name));
  };
  const column = (name: string) => rows.map((row) => text(row.getCell(colOf(name))));
  return { headerRow, header: cols.filter((v) => v != null), at, column, count: rows.length };
}

const DETAIL_COLUMNS = [
  "No.",
  "区分",
  "タイトル",
  "コマンド",
  "状態",
  "更新者",
  "更新日時",
  "コメント",
  "エビデンス",
];

describe("buildWorkbook", () => {
  it("シートは「実行記録」の1枚で、枠線を消す", async () => {
    const wb = await load(fixture());
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    expect(ws?.name).toBe("実行記録");
    expect(ws?.views[0]?.showGridLines).toBe(false);
  });

  it("1行目に表題と、出力日時・出力した人", async () => {
    const ws = await sheetOf(fixture());
    const a1 = ws.getCell("A1");
    expect(a1.value).toBe("実行記録");
    expect(a1.font.size).toBe(14);
    expect(a1.font.bold).toBe(true);
    const values = (ws.getRow(1).values as unknown[]).filter((v) => v != null);
    expect(values).toContain("出力日時：2026-11-07 16:40　出力した人：管理者");
  });

  it("ヘッダに要件の項目を出す", async () => {
    const ws = await sheetOf(fixture());
    expect(text(valueCell(ws, "手順書名"))).toBe("Web サーバーの証明書更新");
    expect(text(valueCell(ws, "版"))).toBe("v3");
    expect(text(valueCell(ws, "実行者"))).toBe("実行者A");
    expect(text(valueCell(ws, "実行の状態"))).toBe("完了");
    expect(text(valueCell(ws, "開始日時"))).toBe("2026-11-07 10:00");
    expect(text(valueCell(ws, "終了日時"))).toBe("2026-11-07 11:30");
    expect(text(valueCell(ws, "承認状態"))).toBe("承認待ち");
    expect(text(valueCell(ws, "承認者"))).toBe("");
    expect(text(valueCell(ws, "承認日時"))).toBe("");
    const label = findCell(ws, "手順書名");
    if (!label) throw new Error("ラベルがない");
    expect(label.font.bold).toBe(true);
    expect(label.font.name).toBe("Meiryo UI");
    expect(label.font.size).toBe(10);
    expect(label.fill).toMatchObject({ type: "pattern", pattern: "solid" });
  });

  it("承認済みのときだけ承認者と承認日時を出す", async () => {
    const decided = (kind: "approved" | "rejected") => ({
      kind,
      comment: kind === "rejected" ? "足りない" : null,
      actor: APPROVER,
      occurredAt: "2026-11-07T03:00:00.000Z",
    });
    const base = fixture();
    const approved = await sheetOf({
      ...base,
      approvalStatus: "approved",
      approvals: [...base.approvals, decided("approved")],
    });
    expect(text(valueCell(approved, "承認状態"))).toBe("承認済み");
    expect(text(valueCell(approved, "承認者"))).toBe("承認者B");
    expect(text(valueCell(approved, "承認日時"))).toBe("2026-11-07 12:00");

    const rejected = await sheetOf({
      ...base,
      approvalStatus: "rejected",
      approvals: [...base.approvals, decided("rejected")],
    });
    expect(text(valueCell(rejected, "承認状態"))).toBe("差し戻し");
    expect(text(valueCell(rejected, "承認者"))).toBe("");
    expect(text(valueCell(rejected, "承認日時"))).toBe("");
  });

  it("実行中は終了日時が空、承認状態は —", async () => {
    const ws = await sheetOf(
      fixture({ status: "running", endedAt: null, approvalStatus: null, approvals: [] }),
    );
    expect(text(valueCell(ws, "実行の状態"))).toBe("実行中");
    expect(text(valueCell(ws, "終了日時"))).toBe("");
    expect(text(valueCell(ws, "承認状態"))).toBe("—");
  });

  it("中止した実行には、中止した人と理由の行を足す", async () => {
    expect(findCell(await sheetOf(fixture()), "中止した人")).toBeUndefined();
    const ws = await sheetOf(
      fixture({
        status: "cancelled",
        approvalStatus: null,
        approvals: [],
        cancelledBy: EXECUTOR,
        cancelReason: "作業時間を過ぎたため",
      }),
    );
    expect(text(valueCell(ws, "実行の状態"))).toBe("中止");
    expect(text(valueCell(ws, "中止した人"))).toBe("実行者A");
    expect(text(valueCell(ws, "中止の理由"))).toBe("作業時間を過ぎたため");
  });

  it("結合したヘッダのセルは、長い値が見えるよう行の高さを決める", async () => {
    const reason = "作業時間を過ぎたため中止した。".repeat(20); // 全角 300 文字
    const ws = await sheetOf(
      fixture({
        status: "cancelled",
        approvalStatus: null,
        approvals: [],
        cancelledBy: EXECUTOR,
        cancelReason: reason,
      }),
    );
    const cell = valueCell(ws, "中止の理由");
    expect(text(cell)).toBe(reason);
    // G:I の幅（89 文字分）に全角 300 文字（600 文字分）は 7 行
    expect(ws.getRow(Number(cell.row)).height).toBeGreaterThanOrEqual(7 * 13);
    // 短い値の行は高さを決めない（Excel の既定のまま）
    expect(ws.getRow(Number(valueCell(ws, "版").row)).height ?? 0).toBeLessThanOrEqual(20);
  });

  it("1つのセルは Excel の上限 32767 文字を超えないよう、切って注記を付ける", async () => {
    const base = fixture();
    const [first, ...rest] = base.steps;
    if (!first) throw new Error("ステップがない");
    const big = (n: number) => ({
      id: newId(),
      body: `${n}`.repeat(20000),
      createdBy: EXECUTOR,
      createdAt: "2026-11-07T01:05:00.000Z",
    });
    const ws = await sheetOf({
      ...base,
      steps: [{ ...first, evidences: [big(1), big(2)] }, ...rest],
    });
    const value = text(detailRows(ws).at(0, "エビデンス"));
    expect(value.length).toBeLessThanOrEqual(32767);
    expect(value.startsWith("[2026-11-07 10:05 実行者A] 111")).toBe(true);
    expect(value).toMatch(/…（以下 \d+ 文字を省略。全文は Tadori の画面で確認してください）$/);
  });

  it("明細の見出しと並び", async () => {
    const ws = await sheetOf(fixture());
    const { headerRow, header, column } = detailRows(ws);
    expect(header).toEqual(DETAIL_COLUMNS);
    const h = ws.getRow(headerRow).getCell(1);
    expect(h.font.bold).toBe(true);
    expect(h.alignment.horizontal).toBe("center");
    expect(column("No.")).toEqual(["1", "2", "3", "1"]);
    expect(column("区分")).toEqual(["手順", "手順", "手順", "切り戻し"]);
    expect(column("状態")).toEqual(["完了", "スキップ", "未実施", "未実施"]);
  });

  it("タイトルとコマンドを置換し、秘密変数は ●●●●", async () => {
    const { at } = detailRows(await sheetOf(fixture()));
    expect(text(at(0, "タイトル"))).toBe("web01.example.test に接続");
    expect(text(at(0, "コマンド"))).toBe("ssh web01.example.test -p 22");
    expect(text(at(1, "コマンド"))).toBe("echo ●●●● | sudo -S systemctl reload nginx");
    expect(text(at(2, "コマンド"))).toBe("");
    expect(at(0, "コマンド").font.name).toBe("Consolas");
    expect(at(0, "コマンド").font.size).toBe(9);
  });

  it("更新者・更新日時は未実施なら空", async () => {
    const { at } = detailRows(await sheetOf(fixture()));
    expect(text(at(0, "更新者"))).toBe("実行者A");
    expect(text(at(0, "更新日時"))).toBe("2026-11-07 10:10");
    expect(text(at(2, "更新者"))).toBe("");
    expect(text(at(2, "更新日時"))).toBe("");
  });

  it("コメントのセル：スキップの理由を先頭に、古い順に [日時 名前] 本文", async () => {
    const { at } = detailRows(await sheetOf(fixture()));
    expect(text(at(1, "コメント"))).toBe(
      "スキップの理由：対象外のため\n[2026-11-07 10:05 実行者A] 1件目\n[2026-11-07 10:06 実行者A] 2件目",
    );
    expect(text(at(1, "エビデンス"))).toBe("[2026-11-07 10:07 実行者A] OK ●●●●");
    expect(text(at(0, "コメント"))).toBe("");
  });

  it("本文が = で始まっても文字列のまま", async () => {
    const base = fixture();
    const [first, ...rest] = base.steps;
    if (!first) throw new Error("ステップがない");
    const ws = await sheetOf({
      ...base,
      steps: [
        {
          ...first,
          comments: [
            {
              id: newId(),
              body: "=1+1",
              createdBy: EXECUTOR,
              createdAt: "2026-11-07T01:05:00.000Z",
            },
          ],
        },
        ...rest,
      ],
    });
    const cell = detailRows(ws).at(0, "コメント");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe("[2026-11-07 10:05 実行者A] =1+1");
  });

  it("セルは上寄せで折り返す", async () => {
    const { at } = detailRows(await sheetOf(fixture()));
    for (const name of DETAIL_COLUMNS) {
      expect(at(1, name).alignment.vertical).toBe("top");
      expect(at(1, name).alignment.wrapText).toBe(true);
    }
    for (const name of ["No.", "区分", "状態"]) {
      expect(at(1, name).alignment.horizontal).toBe("center");
    }
  });

  it("印刷の設定", async () => {
    const ws = await sheetOf(fixture());
    const { headerRow } = detailRows(ws);
    expect(ws.pageSetup).toMatchObject({
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${headerRow}:${headerRow}`,
    });
    expect(ws.headerFooter.oddFooter).toBe("&C&P / &N ページ");
  });
});
