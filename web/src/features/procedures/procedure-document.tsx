import type { ProcedureContent, ProcedureStep, ProcedureVariable } from "@tadori/shared";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ListOrdered,
  ListTodo,
  Lock,
  Undo2,
  Variable,
} from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VarText } from "./var-text.tsx";

// 手順書の文書の表示（S-05・S-07 で共通、ui.md 7.3）。変数は `#{変数名}` のまま見せる（置換は実行のときだけ）。
// 説明と前提条件は Markdown（D-09）。HTML は react-markdown の既定どおり出さない。

const MARKDOWN_CLASS =
  "text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px] [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+*]:mt-2 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5";

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn(MARKDOWN_CLASS, className)}>
      <Markdown>{text}</Markdown>
    </div>
  );
}

function StepItem({
  step,
  index,
  rollback,
}: {
  step: ProcedureStep;
  index: number;
  rollback?: boolean;
}) {
  return (
    <li className="flex gap-4 border-b py-5 first:pt-0 last:border-0 last:pb-0">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
          rollback ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground",
        )}
        aria-hidden
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">
            <span className="sr-only">{index + 1}. </span>
            <VarText text={step.title} />
          </h3>
          {step.evidenceRequired && (
            <Badge variant="outline" className="border-primary/30 text-accent-foreground">
              <Camera aria-hidden />
              エビデンス必須
            </Badge>
          )}
        </div>
        {step.description && (
          <MarkdownText text={step.description} className="mt-1 text-muted-foreground" />
        )}
        {step.command && (
          <pre className="mt-2.5 rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">
            <VarText text={step.command} />
          </pre>
        )}
        {step.verification && (
          <div className="mt-2.5 flex items-start gap-2 text-sm">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              <span className="text-muted-foreground">確認：</span>
              <VarText text={step.verification} />
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function StepList({ steps, rollback }: { steps: ProcedureStep[]; rollback?: boolean }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <StepItem key={s.id} step={s} index={i} rollback={rollback} />
      ))}
    </ol>
  );
}

/** 本文（前提条件・手順・切り戻し手順）。 */
export function ProcedureDocument({ content }: { content: ProcedureContent }) {
  const [rollbackOpen, setRollbackOpen] = useState(false);
  return (
    <div className="grid gap-4">
      {content.prerequisites && (
        <section className="rounded-xl border bg-card p-5" aria-labelledby="sec-pre">
          <h2 id="sec-pre" className="flex items-center gap-2 font-semibold">
            <ListTodo className="size-4 text-muted-foreground" aria-hidden />
            前提条件
          </h2>
          <MarkdownText text={content.prerequisites} className="mt-2" />
        </section>
      )}

      <section className="rounded-xl border bg-card p-5" aria-labelledby="sec-steps">
        <div className="flex items-baseline gap-2">
          <h2 id="sec-steps" className="flex items-center gap-2 font-semibold">
            <ListOrdered className="size-4 text-muted-foreground" aria-hidden />
            手順
          </h2>
          <span className="text-sm text-muted-foreground">{content.steps.length} ステップ</span>
        </div>
        <div className="mt-4">
          <StepList steps={content.steps} />
        </div>
      </section>

      {/* 切り戻し手順は普段は折りたたむ（D-03） */}
      {content.rollbackSteps.length > 0 && (
        <section className="overflow-hidden rounded-xl border bg-card">
          <button
            type="button"
            aria-expanded={rollbackOpen}
            onClick={() => setRollbackOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-5 py-4 text-left transition-colors hover:bg-muted/50"
          >
            <Undo2 className="size-4 text-warning" aria-hidden />
            <span className="font-semibold">切り戻し手順</span>
            <span className="text-sm text-muted-foreground">
              {content.rollbackSteps.length} ステップ ・ 作業全体を作業前の状態に戻すときに使います
            </span>
            {rollbackOpen ? (
              <ChevronUp className="ml-auto size-4 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
            )}
          </button>
          {rollbackOpen && (
            <div className="animate-in border-t px-5 py-5 duration-200 fade-in-0">
              <StepList steps={content.rollbackSteps} rollback />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** 右の変数の一覧。秘密変数は鍵のバッジ。 */
export function VariableList({ variables }: { variables: ProcedureVariable[] }) {
  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="sec-vars">
      <h2 id="sec-vars" className="flex items-center gap-2 font-semibold">
        <Variable className="size-4 text-muted-foreground" aria-hidden />
        変数
        <span className="text-sm font-normal text-muted-foreground">{variables.length}</span>
      </h2>
      {variables.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">変数はありません</p>
      ) : (
        <ul className="mt-2 divide-y text-sm">
          {variables.map((v) => (
            <li key={v.name} className="py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px]">{`#{${v.name}}`}</span>
                {v.secret && (
                  <Badge variant="outline" className="border-warning/40 text-warning">
                    <Lock aria-hidden />
                    秘密
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {v.description}
                {!v.secret && v.default !== null && (
                  <>
                    {v.description && " ・ "}既定値 <span className="font-mono">{v.default}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
