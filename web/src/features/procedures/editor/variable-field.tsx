import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import type { ProcedureVariable } from "@tadori/shared";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  fixFullwidthOpen,
  refreshVariables,
  variableCompletions,
  variableHighlight,
} from "./variable-field-ext.ts";

// 説明・コマンド・確認方法の入力欄（D-17）。`#{` の入力補完と、変数の色付けを持つ。
// 値は外から渡す（制御された欄）。外から値が変わったとき（読み込み直しなど）だけ文書を置き換える。

const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { padding: "0", fontFamily: "inherit", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "color-mix(in oklch, var(--muted-foreground) 70%, transparent)" },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    borderRadius: "var(--radius)",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans)",
    maxHeight: "16rem",
    padding: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: "calc(var(--radius) - 4px)",
    lineHeight: "1.25",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-completionLabel": { fontFamily: "var(--font-mono)", fontSize: "13px" },
  ".cm-completionDetail": {
    marginLeft: "auto",
    fontStyle: "normal",
    fontSize: "12px",
    color: "var(--muted-foreground)",
  },
  ".cm-completionIcon": { display: "none" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "600" },
});

export function VariableField({
  value,
  onChange,
  onBlur,
  variables,
  mono = false,
  placeholder,
  invalid = false,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  variables: ProcedureVariable[];
  mono?: boolean;
  placeholder?: string;
  invalid?: boolean;
  label: string;
  id?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, onBlur, variables });
  latest.current = { onChange, onBlur, variables };

  // 作るのは1回だけ。値・変数・コールバックは ref から読む
  // biome-ignore lint/correctness/useExhaustiveDependencies: 欄を作り直さないため
  useEffect(() => {
    if (!host.current) return;
    const getVariables = () => latest.current.variables;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            { key: "Tab", run: acceptCompletion },
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          autocompletion({ override: [variableCompletions(getVariables)], icons: false }),
          variableHighlight(() => getVariables().map((x) => x.name)),
          EditorView.lineWrapping,
          placeholder ? placeholderExt(placeholder) : [],
          theme,
          EditorView.contentAttributes.of({ "aria-label": label, ...(id ? { id } : {}) }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            blur: () => {
              latest.current.onBlur?.();
            },
            // 変換を確定した直後に、全角の「＃｛」を「#{」に直して補完を始める（D-58）
            compositionend: (_e, view) => {
              queueMicrotask(() => {
                const pos = view.state.selection.main.head;
                const before = view.state.sliceDoc(Math.max(0, pos - 2), pos);
                const fix = fixFullwidthOpen(before);
                if (!fix) return;
                const from = pos - before.length + fix.from;
                view.dispatch({ changes: { from, to: pos, insert: fix.insert } });
                startCompletion(view);
              });
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // 外から値が変わったときだけ文書を置き換える
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  // 変数の一覧が変わったら色付けをやり直す
  const names = variables.map((x) => x.name).join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: names が変わったときだけ
  useEffect(() => {
    view.current?.dispatch({ effects: refreshVariables.of(null) });
  }, [names]);

  useEffect(() => {
    const content = view.current?.contentDOM;
    if (!content) return;
    if (invalid) content.setAttribute("aria-invalid", "true");
    else content.removeAttribute("aria-invalid");
  }, [invalid]);

  return (
    <div
      ref={host}
      data-field-error={invalid || undefined}
      className={cn(
        "min-h-9 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm leading-relaxed transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40",
        mono && "font-mono text-[13px]",
        invalid && "border-destructive ring-3 ring-destructive/20",
      )}
    />
  );
}
