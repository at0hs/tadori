// 実行手順書の置換（D-23）と秘密変数のマスク（D-02、D-56）。画面とサーバーで同じ規則を使う。
import { VARIABLE_NAME_RE } from "./parse.ts";

/** 版の文字列を、そのままの文字と変数の参照に分けたもの。 */
export type TextSegment = { type: "text"; text: string } | { type: "var"; name: string };

/**
 * 版の文字列を、文字と変数の参照に分ける。規則は `findVariableRefs` と同じ。
 * `##{name}` はエスケープなので、前の `#` を1つ取り除いた `#{name}` の文字として出す。
 * 規則に合わない `#{...}` は文字のまま。隣り合う文字は1つにまとめる。
 */
export function splitVariables(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  const pushText = (t: string) => {
    if (t === "") return;
    const prev = out.at(-1);
    if (prev?.type === "text") prev.text += t;
    else out.push({ type: "text", text: t });
  };
  let last = 0;
  for (const m of text.matchAll(/#\{([^}]*)\}/g)) {
    const start = m.index;
    const end = start + m[0].length;
    const name = m[1] ?? "";
    if (!VARIABLE_NAME_RE.test(name)) continue;
    if (start > 0 && text[start - 1] === "#") {
      pushText(text.slice(last, start - 1));
      pushText(m[0]);
    } else {
      pushText(text.slice(last, start));
      out.push({ type: "var", name });
    }
    last = end;
  }
  pushText(text.slice(last));
  return out;
}

/** 秘密変数の値を置き換える文字（画面・Excel・記録の表示で共通）。 */
export const SECRET_MASK = "●●●●";

/** 秘密変数の値の最低文字数（ui.md 8.2）。短すぎる値はマスクで普通の文字まで隠れてしまう。 */
export const SECRET_MIN_LENGTH = 4;

/**
 * テキストの中の秘密変数の値を、すべて `SECRET_MASK` に置き換える。
 * 値が別の値を含むときに備えて長い値から順に置き換え、正規表現は使わない（値の記号を文字どおりに扱う）。
 */
export function maskSecrets(text: string, values: readonly string[]): string {
  const sorted = values.filter((v) => v !== "").sort((a, b) => b.length - a.length);
  let result = text;
  for (const v of sorted) result = result.split(v).join(SECRET_MASK);
  return result;
}
