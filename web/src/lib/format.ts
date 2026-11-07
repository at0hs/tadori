// 時刻の表示（ui.md 5.4）。API は UTC の ISO 8601 で受け渡し、画面で日本時間にする。

const parts = (iso: string) => {
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

/** 例：2026/11/05 16:40 */
export function formatDateTime(iso: string): string {
  const p = parts(iso);
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 例：11/05 16:40（一覧など、年がなくても分かるところ） */
export function formatShortDateTime(iso: string): string {
  const p = parts(iso);
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}
