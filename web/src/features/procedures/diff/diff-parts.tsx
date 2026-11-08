import { ArrowRight, ArrowUpDown, Minus, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { VarText } from "../var-text.tsx";
import type { LinePart, TextPart } from "./compute.ts";

// S-17 の差分の小さな部品（ui.md 10.3）。色は CSS 変数だけ（D-62）。

export const DEL_CLASS =
  "rounded-sm bg-destructive/15 px-px text-foreground line-through decoration-destructive/70";
export const INS_CLASS = "rounded-sm bg-success/20 px-px text-foreground no-underline";

/** 1つの文の中に、消えた文字（赤い地に取り消し線）と足した文字（緑の地）を並べる。 */
export function InlineDiff({ parts, strong }: { parts: TextPart[]; strong?: boolean }) {
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p.kind}`;
        if (p.kind === "del")
          return (
            <del key={key} className={cn(DEL_CLASS, strong && "bg-destructive/25")}>
              <VarText text={p.text} />
            </del>
          );
        if (p.kind === "add")
          return (
            <ins key={key} className={cn(INS_CLASS, strong && "bg-success/30")}>
              <VarText text={p.text} />
            </ins>
          );
        return <VarText key={key} text={p.text} />;
      })}
    </>
  );
}

const LINE_MARK = { same: " ", del: "−", add: "＋" } as const;
const LINE_SR = { same: "", del: "削除した行：", add: "追加した行：" } as const;

/** コマンド・前提条件の行の差分。消えた行は「−」と赤い地、足した行は「＋」と緑の地。 */
export function LineDiffBlock({ lines, className }: { lines: LinePart[]; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg bg-muted py-1.5 font-mono text-[13px] leading-relaxed",
        className,
      )}
    >
      {lines.map((l, i) => (
        <div
          // 行は並びが変わらないので、番号で足りる
          // biome-ignore lint/suspicious/noArrayIndexKey: 行の並びは固定
          key={i}
          className={cn(
            "flex px-3 break-all whitespace-pre-wrap",
            l.kind === "del" && "bg-destructive/12",
            l.kind === "add" && "bg-success/15",
          )}
        >
          <span
            className={cn(
              "w-4 shrink-0 select-none text-muted-foreground",
              l.kind === "del" && "text-destructive",
              l.kind === "add" && "text-success",
            )}
            aria-hidden
          >
            {LINE_MARK[l.kind]}
          </span>
          <span className="min-w-0">
            <span className="sr-only">{LINE_SR[l.kind]}</span>
            {l.parts.length === 0 || l.parts.every((p) => p.text === "") ? (
              "​"
            ) : l.kind === "same" ? (
              <InlineDiff parts={l.parts} />
            ) : (
              <InlineDiff parts={l.parts} strong />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

const BADGE =
  "inline-flex h-5 items-center gap-1 rounded-4xl px-2 text-xs font-medium whitespace-nowrap";

export type ChangeBadgeProps =
  | { kind: "add" | "del" | "mod" }
  | { kind: "move"; from: number; to: number };

/** 追加・削除・変更・移動の印。 */
export function ChangeBadge(props: ChangeBadgeProps) {
  switch (props.kind) {
    case "add":
      return (
        <span className={cn(BADGE, "bg-success/15 text-success")}>
          <Plus className="size-3" aria-hidden />
          追加
        </span>
      );
    case "del":
      return (
        <span className={cn(BADGE, "bg-destructive/12 text-destructive")}>
          <Minus className="size-3" aria-hidden />
          削除
        </span>
      );
    case "mod":
      return (
        <span className={cn(BADGE, "bg-warning/15 text-warning")}>
          <Pencil className="size-3" aria-hidden />
          変更
        </span>
      );
    case "move":
      return (
        <span className={cn(BADGE, "bg-accent text-accent-foreground")}>
          <ArrowUpDown className="size-3" aria-hidden />
          移動 {props.from} → {props.to}
        </span>
      );
  }
}

/** 短い値の前と後（「4 → 8」「なし → あり」）。 */
export function BeforeAfter({
  before,
  after,
  className,
}: {
  before: React.ReactNode;
  after: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <del className={DEL_CLASS}>{before}</del>
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="から" />
      <ins className={INS_CLASS}>{after}</ins>
    </span>
  );
}
