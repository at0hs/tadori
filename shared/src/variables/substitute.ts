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
 * 先に元のテキストで値に一致する範囲をすべて探し、重なる・接する範囲を1つにまとめてから置き換える
 * （値を順に置き換えると、端が重なる2つの値がつながったとき、後の値の一部が平文で残るため）。
 * 正規表現は使わない（値の記号を文字どおりに扱う）。
 */
export function maskSecrets(text: string, values: readonly string[]): string {
  const ranges: [number, number][] = [];
  for (const v of values) {
    if (v === "") continue;
    for (let i = text.indexOf(v); i !== -1; i = text.indexOf(v, i + 1)) {
      ranges.push([i, i + v.length]);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  let result = "";
  let pos = 0;
  let [start, end] = ranges[0] as [number, number];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= end) {
      end = Math.max(end, e);
      continue;
    }
    result += text.slice(pos, start) + SECRET_MASK;
    pos = end;
    [start, end] = [s, e];
  }
  return result + text.slice(pos, start) + SECRET_MASK + text.slice(end);
}

/**
 * 版の文字列を置き換えた1つの文字列にする（サーバーの出力用。Excel など）。
 * 秘密変数は常に `SECRET_MASK`、値のない変数は `#{name}` のまま。
 */
export function substituteText(
  text: string,
  values: Readonly<Record<string, string>>,
  secretNames: readonly string[],
): string {
  return splitVariables(text)
    .map((s) => {
      if (s.type === "text") return s.text;
      if (secretNames.includes(s.name)) return SECRET_MASK;
      return values[s.name] ?? `#{${s.name}}`;
    })
    .join("");
}
