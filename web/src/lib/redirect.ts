// URL として解釈するときの仮の起点。同じ起点のままなら、アプリ内のパスとみなす。
const BASE = "http://tadori.invalid";

/**
 * ログイン後の行き先（screens.md の S-01）。アプリ内のパスだけを受け付け、
 * 外のサイトへ飛ばされないようにする。合わなければ "/"。
 * ブラウザと同じ規則（タブ・改行の除去、\ を / とみなす、. と .. の正規化）で解釈してから確かめる。
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  const path = `${url.pathname}${url.search}${url.hash}`;
  // 正規化した結果が //… なら、それ自体が別のサイトを指す
  if (path.startsWith("//")) return "/";
  return path;
}
