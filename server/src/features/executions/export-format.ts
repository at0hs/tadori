// Excel 出力（F-09）のファイル名と日時の整形（ui.md 8.9）。ExcelJS に依らない。

const jstParts = (iso: string) => {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))) {
    map[p.type] = p.value;
  }
  return map;
};

/** 日本時間の `YYYY-MM-DD HH:mm`。 */
export function formatJst(iso: string): string {
  const p = jstParts(iso);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export type ExportFileNames = {
  /** 日本語を含む名前（`filename*` で送る） */
  name: string;
  /** ASCII だけの名前（`filename` で送る） */
  ascii: string;
};

/** `手順書名_v版数_開始日.xlsx`。Windows のファイル名に使えない文字と改行は `_` にする。 */
export function exportFileName(
  title: string,
  versionNo: number,
  startedAt: string,
): ExportFileNames {
  const p = jstParts(startedAt);
  const suffix = `_v${versionNo}_${p.year}${p.month}${p.day}.xlsx`;
  return {
    name: title.replace(/[\\/:*?"<>|\r\n]/g, "_") + suffix,
    ascii: `execution${suffix}`,
  };
}

/** RFC 5987 の値（encodeURIComponent が残す `'()*` も %XX にする）。 */
const encodeRfc5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** ダウンロードの `Content-Disposition`（RFC 6266）。 */
export function contentDisposition(names: ExportFileNames): string {
  return `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeRfc5987(names.name)}`;
}
