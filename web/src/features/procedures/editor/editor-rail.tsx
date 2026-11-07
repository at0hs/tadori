import type { ProcedureContent } from "@tadori/shared";
import { Check, Copy, FileText, ListOrdered, ListTodo, Lock, Undo2, Variable } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 編集画面の右のパネル（ui.md 7.5）：目次と変数の早見。スクロールしても残す。

const ITEM =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function ErrorDot() {
  return (
    <>
      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
      <span className="sr-only">（エラーあり）</span>
    </>
  );
}

export function EditorRail({ onJump }: { onJump: (path: string) => void }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<ProcedureContent>();
  const [steps, rollbackSteps, variables] = useWatch({
    control,
    name: ["steps", "rollbackSteps", "variables"],
  });
  const basicError = !!(errors.title || errors.summary || errors.tags);

  const stepItems = (list: "steps" | "rollbackSteps", items: ProcedureContent["steps"]) => (
    <div className="ml-4 grid gap-0.5 border-l pl-1">
      {items.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={cn(ITEM, "pl-2")}
          onClick={() => onJump(`${list}.${i}`)}
        >
          <span className="w-4 shrink-0 text-right text-xs tabular-nums">{i + 1}</span>
          <span className="truncate">{s.title || "（タイトルなし）"}</span>
          {errors[list]?.[i] && <ErrorDot />}
        </button>
      ))}
    </div>
  );

  return (
    <aside className="sticky top-36 hidden max-h-[calc(100vh-10rem)] min-w-0 grid-cols-1 gap-4 overflow-auto lg:grid">
      <nav className="rounded-xl border bg-card p-2" aria-label="目次">
        <button type="button" className={ITEM} onClick={() => onJump("title")}>
          <FileText className="size-4" aria-hidden />
          基本情報
          {basicError && <ErrorDot />}
        </button>
        <button type="button" className={ITEM} onClick={() => onJump("prerequisites")}>
          <ListTodo className="size-4" aria-hidden />
          前提条件
        </button>
        <button type="button" className={ITEM} onClick={() => onJump("variables")}>
          <Variable className="size-4" aria-hidden />
          変数
          {errors.variables ? (
            <ErrorDot />
          ) : (
            <span className="ml-auto text-xs tabular-nums">{variables.length}</span>
          )}
        </button>
        <button type="button" className={ITEM} onClick={() => onJump("steps")}>
          <ListOrdered className="size-4" aria-hidden />
          手順
          <span className="ml-auto text-xs tabular-nums">{steps.length}</span>
        </button>
        {stepItems("steps", steps)}
        <button type="button" className={ITEM} onClick={() => onJump("rollbackSteps")}>
          <Undo2 className="size-4" aria-hidden />
          切り戻し手順
          <span className="ml-auto text-xs tabular-nums">{rollbackSteps.length}</span>
        </button>
        {stepItems("rollbackSteps", rollbackSteps)}
      </nav>

      <section className="rounded-xl border bg-card p-4" aria-label="変数の早見">
        <h3 className="text-sm font-semibold">変数</h3>
        {variables.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">まだありません</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {variables.map((v, i) =>
              v.name ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: 名前は入力中に変わる
                <VariableChip key={i} name={v.name} secret={v.secret} />
              ) : null,
            )}
          </ul>
        )}
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          入力欄で <span className="font-mono">#{"{"}</span> と打つと候補が出ます
        </p>
      </section>
    </aside>
  );
}

function VariableChip({ name, secret }: { name: string; secret: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = `#{${name}}`;
  return (
    <li className="group flex items-center gap-2 text-sm">
      <span className="truncate font-mono text-[13px]">{text}</span>
      {secret && <Lock className="size-3.5 shrink-0 text-warning" aria-label="秘密変数" />}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`${text} をコピー`}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </li>
  );
}
