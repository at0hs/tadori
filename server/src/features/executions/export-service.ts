import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";
import { type ExportFileNames, exportFileName } from "./export-format.ts";
import { buildWorkbook } from "./export-workbook.ts";
import { getExecution } from "./read-service.ts";

// Excel 出力（F-09、api.md 5.3）。全員が出力できる（authorization.md）。
// GET だが操作ログを出す（conventions.md 5章の例外）。ファイルの中身や名前はログに出さない。

export async function exportExecution(
  op: Operator,
  id: string,
): Promise<{ body: Uint8Array<ArrayBuffer>; names: ExportFileNames }> {
  const detail = await getExecution(op.actor, id);
  const body = await buildWorkbook(detail, { by: op.actor.name, at: new Date() });
  logOperation(
    op.meta,
    { event: "execution.exported", actorId: op.actor.id, target: { type: "execution", id } },
    "実行記録を Excel に出力した",
  );
  return {
    body,
    names: exportFileName(detail.procedure.title, detail.versionNo, detail.startedAt),
  };
}
