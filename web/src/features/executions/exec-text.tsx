import { type RenderContext, renderPieces } from "./render.ts";

export const VALUE_CLASS = "rounded bg-accent/70 px-0.5 text-accent-foreground";
export const SECRET_CLASS = "rounded bg-warning/15 px-0.5 font-medium text-warning";

/** 実行手順書の文字列（変数を値に置き換え、秘密変数はマスク。ui.md 8章）。 */
export function ExecText({ text, ctx }: { text: string; ctx: RenderContext }) {
  return (
    <>
      {renderPieces(text, ctx).map((p, i) => {
        // 部品の並びは text が同じなら変わらないので、位置をキーにしてよい
        const key = `${p.type}${i}`;
        if (p.type === "text") return <span key={key}>{p.text}</span>;
        if (p.type === "value") {
          return (
            <span key={key} className={VALUE_CLASS} title={`#{${p.name}}`}>
              {p.text}
            </span>
          );
        }
        return (
          <span key={key} className={SECRET_CLASS} title={`#{${p.name}}（秘密変数）`}>
            {p.text}
          </span>
        );
      })}
    </>
  );
}
