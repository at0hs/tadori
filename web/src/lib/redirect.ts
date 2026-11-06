/**
 * ログイン後の行き先（screens.md の S-01）。アプリ内のパスだけを受け付け、
 * 外のサイトへ飛ばされないようにする。合わなければ "/"。
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
