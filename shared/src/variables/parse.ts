// `#{変数名}` の解析（F-04、D-06）。画面とサーバーで同じ規則を使う。
// 規則を変えると過去の実行の見え方も変わるので、変えるときは設計判断として記録する。

/** 変数名の規則：英字で始まり、英数字・`_`・`-` が続く（最大 64 文字）。 */
export const VARIABLE_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** テキストの中の変数の参照。`start`〜`end` は `#{` から `}` までを含む。 */
export type VariableRef = { name: string; start: number; end: number };

/**
 * テキストの中の `#{name}` を順に返す。
 * `##{name}` はエスケープ（`#{name}` という文字列）、規則に合わない `#{...}` はただの文字列なので含めない。
 */
export function findVariableRefs(text: string): VariableRef[] {
  const refs: VariableRef[] = [];
  for (const m of text.matchAll(/#\{([^}]*)\}/g)) {
    const start = m.index;
    if (start > 0 && text[start - 1] === "#") continue;
    const name = m[1] ?? "";
    if (!VARIABLE_NAME_RE.test(name)) continue;
    refs.push({ name, start, end: start + m[0].length });
  }
  return refs;
}
