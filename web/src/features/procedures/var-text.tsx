import { findVariableRefs } from "@tadori/shared";
import { Fragment } from "react";

/** `#{name}` を目立たせる見た目（ui.md 7.3）。未定義は赤い波線（7.5）。 */
export const VAR_CLASS = "rounded bg-accent px-0.5 font-medium text-accent-foreground";
export const VAR_UNDEFINED_CLASS =
  "rounded bg-destructive/10 px-0.5 font-medium text-destructive underline decoration-destructive/70 decoration-wavy underline-offset-2";

/**
 * テキストの中の `#{name}` を色付けして出す。置換はしない（S-05 は `#{変数名}` のまま見せる）。
 * defined を渡したときだけ、未定義の変数を別の色にする。
 */
export function VarText({ text, defined }: { text: string; defined?: readonly string[] }) {
  const refs = findVariableRefs(text);
  if (refs.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const ref of refs) {
    parts.push(<Fragment key={`t${ref.start}`}>{text.slice(pos, ref.start)}</Fragment>);
    const undef = defined !== undefined && !defined.includes(ref.name);
    parts.push(
      <span key={`v${ref.start}`} className={undef ? VAR_UNDEFINED_CLASS : VAR_CLASS}>
        {text.slice(ref.start, ref.end)}
      </span>,
    );
    pos = ref.end;
  }
  parts.push(<Fragment key="end">{text.slice(pos)}</Fragment>);
  return <>{parts}</>;
}
