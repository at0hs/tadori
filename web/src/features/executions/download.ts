// Excel 出力（F-09、ui.md 8.9）のダウンロード。

/** `Content-Disposition` のファイル名。`filename*`（RFC 5987）を優先し、なければ `filename`。 */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // 壊れた値なら filename を使う
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header);
  return plain?.[1] || null;
}

/** 取得したファイルを保存させる。 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // クリックの直後に解放するとダウンロードが始まらないブラウザがあるので、少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * S-12 の見出しのどこに「Excel に出力」を置くか（ui.md 8.4 の表）。
 * 主な操作（終了・承認・再依頼）があれば「⋯」の中、なければ枠線のボタン。
 */
export function exportPlacement(
  operate: boolean,
  action: "review" | "resubmit" | null,
): "menu" | "button" {
  return operate || action !== null ? "menu" : "button";
}
