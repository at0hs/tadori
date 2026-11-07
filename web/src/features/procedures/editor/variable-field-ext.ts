import type { CompletionSource } from "@codemirror/autocomplete";
import { type Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { findVariableRefs, type ProcedureVariable } from "@tadori/shared";
import { VAR_CLASS, VAR_UNDEFINED_CLASS } from "../var-text.tsx";

// CodeMirror の欄の拡張（D-06、D-17、D-58）。純粋な部分はテストで確かめる。

const FULLWIDTH_OPEN = /(?:＃｛|#｛|＃\{)$/;

/**
 * IME が ON のまま `#{` を打つと「＃｛」が入る（library-checks CM-04）。
 * 変換を確定した直後に、カーソルの前の2文字が全角混じりの `#{` なら、`#{` に置き換える位置を返す（D-58）。
 */
export function fixFullwidthOpen(textBeforeCursor: string): { from: number; insert: "#{" } | null {
  if (!FULLWIDTH_OPEN.test(textBeforeCursor)) return null;
  return { from: textBeforeCursor.length - 2, insert: "#{" };
}

/** `#{` の後で、定義済みの変数を候補に出す。`##{` はエスケープなので出さない。 */
export function variableCompletions(getVariables: () => ProcedureVariable[]): CompletionSource {
  return (context) => {
    const match = context.matchBefore(/#?#\{[A-Za-z0-9_-]*$/);
    if (!match || match.text.startsWith("##")) return null;
    const variables = getVariables();
    if (variables.length === 0) return null;
    const from = match.from + match.text.indexOf("{") + 1;
    // すでに } が続いていれば足さない
    const closed = context.state.sliceDoc(context.pos, context.pos + 1) === "}";
    return {
      from,
      validFor: /^[A-Za-z0-9_-]*$/,
      // 定義した順に出す。CodeMirror は boost の大きい順に並べる（-99〜99、変数は100個まで）
      options: variables.map((v, i) => ({
        boost: 99 - i,
        label: v.name,
        detail: v.secret ? `${v.description}（秘密）` : v.description,
        type: v.secret ? "secret" : "variable",
        apply: closed ? v.name : `${v.name}}`,
      })),
    };
  };
}

/** 変数の一覧が変わったので、色付けをやり直す合図。 */
export const refreshVariables = StateEffect.define<null>();

function buildDecorations(view: EditorView, defined: string[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const set = new Set(defined);
  for (const ref of findVariableRefs(view.state.doc.toString())) {
    builder.add(
      ref.start,
      ref.end,
      Decoration.mark({ class: set.has(ref.name) ? VAR_CLASS : VAR_UNDEFINED_CLASS }),
    );
  }
  return builder.finish();
}

/** `#{name}` を色付けする。未定義の変数は赤い波線（ui.md 7.5）。 */
export function variableHighlight(getDefined: () => string[]): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getDefined());
      }
      update(u: ViewUpdate) {
        const refreshed = u.transactions.some((t) => t.effects.some((e) => e.is(refreshVariables)));
        if (u.docChanged || refreshed) this.decorations = buildDecorations(u.view, getDefined());
      }
    },
    { decorations: (p) => p.decorations },
  );
}
