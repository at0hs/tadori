import {
  type ApprovalStatus,
  type ExecutionDetailResponse,
  type ExecutionStatus,
  type StepRecord,
  type StepStatus,
  substituteText,
} from "@tadori/shared";
import ExcelJS from "exceljs";
import { formatJst } from "./export-format.ts";

// 実行記録の Excel（F-09、ui.md 8.9、D-63）。ExcelJS を使うのはこのファイルだけにする。
// 客先への証跡・社内の保管に使うので、1枚のシートに上にヘッダ、下に明細を置き、A4 横で印刷できる形にする。
// セルの値はすべて文字列で入れる（日時を Excel の日付にしない。`=` で始まる本文も数式にしない）。

const FONT = "Meiryo UI";
const MONO = "Consolas";
const BORDER_COLOR = { argb: "FFBFBFBF" };
const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: BORDER_COLOR },
  left: { style: "thin", color: BORDER_COLOR },
  bottom: { style: "thin", color: BORDER_COLOR },
  right: { style: "thin", color: BORDER_COLOR },
};

const STEP_STATUS: Record<StepStatus, string> = {
  pending: "未実施",
  done: "完了",
  skipped: "スキップ",
  failed: "失敗",
};
const EXECUTION_STATUS: Record<ExecutionStatus, string> = {
  running: "実行中",
  completed: "完了",
  abnormal: "異常終了",
  cancelled: "中止",
};
const APPROVAL_STATUS: Record<ApprovalStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "差し戻し",
};

/** 明細の列。ヘッダの枠も同じ9列の中に置く。幅は文字数の目安。 */
const COLUMNS = [
  { header: "No.", width: 6, center: true },
  { header: "区分", width: 8, center: true },
  { header: "タイトル", width: 28 },
  { header: "コマンド", width: 40 },
  { header: "状態", width: 8, center: true },
  { header: "更新者", width: 12 },
  { header: "更新日時", width: 17 },
  { header: "コメント", width: 36 },
  { header: "エビデンス", width: 36 },
] as const;
const COMMAND_COL = 4;
const LAST_COL = COLUMNS.length;

/** ヘッダの枠の1組（ラベルの列の範囲、値の列の範囲）。2組を1行に並べる。 */
const PAIRS = [
  { label: [1, 2], value: [3, 4] },
  { label: [5, 6], value: [7, LAST_COL] },
] as const;

/** Excel の1つのセルに入る文字数の上限。超えると Excel が修復を求め、内容が切れる。 */
const CELL_MAX = 32767;

/** 上限を超える値は切り、省略したことを末尾に書く（サロゲートペアの途中では切らない）。 */
function fitCell(value: string): string {
  if (value.length <= CELL_MAX) return value;
  const note = (n: number) => `…（以下 ${n} 文字を省略。全文は Tadori の画面で確認してください）`;
  let keep = CELL_MAX - note(value.length).length;
  const last = value.charCodeAt(keep - 1);
  if (last >= 0xd800 && last <= 0xdbff) keep--;
  return value.slice(0, keep) + note(value.length - keep);
}

/** 表示の幅（全角を 2、半角を 1 と数える）。行の高さの見積もりに使う。 */
const displayWidth = (line: string) =>
  [...line].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1), 0);

/** 1行の高さ（pt。Meiryo UI 10pt）と、Excel の行の高さの上限。 */
const LINE_HEIGHT = 14;
const ROW_MAX = 409;

const records = (list: StepRecord[]) =>
  list.map((r) => `[${formatJst(r.createdAt)} ${r.createdBy.name}] ${r.body}`);

export async function buildWorkbook(
  detail: ExecutionDetailResponse,
  exported: { by: string; at: Date },
): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("実行記録", {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: "&C&P / &N ページ" },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  const put = (
    row: number,
    [from, to]: readonly [number, number],
    value: string,
    style: { bold?: boolean; fill?: boolean; size?: number; border?: boolean } = {},
  ) => {
    if (to > from) ws.mergeCells(row, from, row, to);
    const cell = ws.getCell(row, from);
    cell.value = fitCell(value);
    cell.font = { name: FONT, size: style.size ?? 10, bold: style.bold ?? false };
    cell.alignment = { vertical: "top", wrapText: true };
    if (style.fill) cell.fill = LABEL_FILL;
    if (style.border !== false) {
      for (let c = from; c <= to; c++) ws.getCell(row, c).border = BORDER;
    }
    return cell;
  };

  // 1行目：表題と、出力日時・出力した人
  put(1, [1, 3], "実行記録", { size: 14, bold: true, border: false });
  const info = put(
    1,
    [4, LAST_COL],
    `出力日時：${formatJst(exported.at.toISOString())}　出力した人：${exported.by}`,
    { size: 9, border: false },
  );
  info.font = { ...info.font, color: { argb: "FF7F7F7F" } };
  info.alignment = { horizontal: "right", vertical: "bottom" };
  ws.getRow(1).height = 24;

  // ヘッダ：ラベルと値を2組ずつ
  const approved =
    detail.approvalStatus === "approved"
      ? detail.approvals.findLast((a) => a.kind === "approved")
      : undefined;
  const headerRows: [string, string][][] = [
    [
      ["手順書名", detail.procedure.title],
      ["版", `v${detail.versionNo}`],
    ],
    [
      ["実行者", detail.executor.name],
      ["実行の状態", EXECUTION_STATUS[detail.status]],
    ],
    [
      ["開始日時", formatJst(detail.startedAt)],
      ["終了日時", detail.endedAt ? formatJst(detail.endedAt) : ""],
    ],
    [
      ["承認状態", detail.approvalStatus ? APPROVAL_STATUS[detail.approvalStatus] : "—"],
      ["承認者", approved?.actor.name ?? ""],
    ],
    [["承認日時", approved ? formatJst(approved.occurredAt) : ""]],
  ];
  if (detail.status === "cancelled") {
    headerRows.push([
      ["中止した人", detail.cancelledBy?.name ?? ""],
      ["中止の理由", detail.cancelReason ?? ""],
    ]);
  }
  let row = 2;
  for (const pairs of headerRows) {
    PAIRS.forEach((pair, i) => {
      const entry = pairs[i];
      if (!entry) return;
      put(row, pair.label, entry[0], { bold: true, fill: true });
      put(row, pair.value, entry[1]);
    });
    // 結合したセルの行は Excel が高さを自動で合わせないので、長い値が見えるよう見積もって決める
    const lines = Math.max(
      ...PAIRS.map((pair, i) => {
        const value = pairs[i]?.[1] ?? "";
        const width = COLUMNS.slice(pair.value[0] - 1, pair.value[1]).reduce(
          (w, c) => w + c.width,
          0,
        );
        return value
          .split("\n")
          .reduce((n, line) => n + Math.max(1, Math.ceil(displayWidth(line) / width)), 0);
      }),
    );
    if (lines > 1) ws.getRow(row).height = Math.min(ROW_MAX, lines * LINE_HEIGHT + 4);
    row++;
  }

  // 1行空けて明細
  row++;
  const headerRow = row;
  COLUMNS.forEach((c, i) => {
    const cell = put(headerRow, [i + 1, i + 1], c.header, { bold: true, fill: true });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;

  const secretNames = detail.content.variables.filter((v) => v.secret).map((v) => v.name);
  const sub = (text: string) => substituteText(text, detail.variables, secretNames);
  const defs = new Map(
    [...detail.content.steps, ...detail.content.rollbackSteps].map((s) => [s.id, s]),
  );
  const numbers = { main: 0, rollback: 0 };
  for (const step of detail.steps) {
    row++;
    const def = defs.get(step.stepId);
    const no = ++numbers[step.section];
    const comments = [
      ...(step.skipReason ? [`スキップの理由：${step.skipReason}`] : []),
      ...records(step.comments),
    ];
    const values = [
      String(no),
      step.section === "main" ? "手順" : "切り戻し",
      def ? sub(def.title) : "",
      def ? sub(def.command) : "",
      STEP_STATUS[step.status],
      step.updatedBy?.name ?? "",
      step.updatedAt ? formatJst(step.updatedAt) : "",
      comments.join("\n"),
      records(step.evidences).join("\n"),
    ];
    values.forEach((value, i) => {
      const col = i + 1;
      const cell = put(row, [col, col], value);
      if (COLUMNS[i] && "center" in COLUMNS[i]) {
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }
      if (col === COMMAND_COL) cell.font = { name: MONO, size: 9 };
    });
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
