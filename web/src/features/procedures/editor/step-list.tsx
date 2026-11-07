import type { ProcedureContent, ProcedureVariable } from "@tadori/shared";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CopyPlus,
  Ellipsis,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { VarText } from "../var-text.tsx";
import { emptyStep } from "./form.ts";
import { VariableField } from "./variable-field.tsx";

// ステップのカード（D-09、ui.md 7.5）。手順と切り戻し手順で同じ形。

export type StepListName = "steps" | "rollbackSteps";

const STEP_FIELDS = [
  { key: "description", label: "説明", hint: "Markdown", placeholder: "補足や注意点（任意）" },
  {
    key: "command",
    label: "コマンド",
    mono: true,
    placeholder: "実行するコマンド（任意・複数行可）",
  },
  {
    key: "verification",
    label: "確認方法・期待結果",
    placeholder: "どうなっていれば成功か（任意）",
  },
] as const;

export function StepList({
  name,
  variables,
  initiallyOpen,
}: {
  name: StepListName;
  variables: ProcedureVariable[];
  /** 最初に開いておくステップの数（読み込んだときは 2） */
  initiallyOpen: number;
}) {
  const { control, getValues } = useFormContext<ProcedureContent>();
  const { fields, append, insert, remove, move } = useFieldArray({
    control,
    name,
    keyName: "fieldKey",
  });
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(fields.slice(0, initiallyOpen).map((f) => f.id)),
  );
  const toggle = (id: string, on: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const add = (index?: number) => {
    const s = emptyStep();
    if (index === undefined) append(s);
    else insert(index, s);
    toggle(s.id, true);
  };
  const rollback = name === "rollbackSteps";

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-8 text-center">
        <p className="text-sm font-medium">
          {rollback ? "切り戻し手順はまだありません" : "ステップがまだありません"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {rollback
            ? "作業全体を作業前の状態に戻す手順を書きます（任意）"
            : "公開するには、手順のステップが1つ以上必要です"}
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => add()}>
          <Plus aria-hidden />
          ステップを追加
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {fields.map((f, i) => (
        <StepCard
          key={f.fieldKey}
          name={name}
          index={i}
          count={fields.length}
          variables={variables}
          open={open.has(f.id)}
          onToggle={(on) => toggle(f.id, on)}
          onMove={(to) => move(i, to)}
          onDuplicate={() => {
            const copy = { ...getValues(`${name}.${i}`), id: emptyStep().id };
            insert(i + 1, copy);
            toggle(copy.id, true);
          }}
          onRemove={() => remove(i)}
        />
      ))}
      <button
        type="button"
        onClick={() => add()}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        ステップを追加
      </button>
    </div>
  );
}

function StepCard({
  name,
  index,
  count,
  variables,
  open,
  onToggle,
  onMove,
  onDuplicate,
  onRemove,
}: {
  name: StepListName;
  index: number;
  count: number;
  variables: ProcedureVariable[];
  open: boolean;
  onToggle: (open: boolean) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ProcedureContent>();
  const step = useWatch({ control, name: `${name}.${index}` });
  const err = errors[name]?.[index];
  const hasError = !!err;
  // エラーのあるカードは開いて見せる
  const expanded = open || hasError;
  const rollback = name === "rollbackSteps";
  const no = (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
        rollback ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground",
      )}
      aria-hidden
    >
      {index + 1}
    </span>
  );
  const label = `${rollback ? "切り戻し手順" : "手順"} ${index + 1}`;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${label}のその他の操作`}
          />
        }
      >
        <Ellipsis aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp aria-hidden />
          上へ移動
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown aria-hidden />
          下へ移動
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <CopyPlus aria-hidden />
          複製
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 aria-hidden />
          削除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!expanded) {
    return (
      <div
        id={`${name}-${index}`}
        className="flex scroll-mt-48 items-center gap-2 rounded-xl border bg-card px-2 py-1.5 transition-shadow hover:shadow-sm"
      >
        {no}
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
          aria-label={`${label}「${step?.title ?? ""}」を開く`}
        >
          {step?.title ? (
            <VarText text={step.title} />
          ) : (
            <span className="text-muted-foreground">（タイトルなし）</span>
          )}
        </button>
        {step?.command && (
          <span className="hidden max-w-72 truncate font-mono text-xs text-muted-foreground lg:block">
            {step.command.split("\n")[0]}
          </span>
        )}
        {step?.evidenceRequired && (
          <Camera className="size-3.5 text-muted-foreground" aria-label="エビデンス必須" />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${label}を開く`}
          onClick={() => onToggle(true)}
        >
          <ChevronDown aria-hidden />
        </Button>
        {menu}
      </div>
    );
  }

  return (
    <div
      id={`${name}-${index}`}
      className={cn(
        "scroll-mt-48 rounded-xl border bg-card",
        hasError && "border-destructive ring-3 ring-destructive/15",
      )}
    >
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        {no}
        <Input
          aria-label={`${label}のタイトル`}
          placeholder="ステップのタイトル（必須）"
          aria-invalid={err?.title ? true : undefined}
          className="flex-1 border-transparent bg-transparent font-medium hover:border-input"
          {...register(`${name}.${index}.title`)}
        />
        <Controller
          control={control}
          name={`${name}.${index}.evidenceRequired`}
          render={({ field }) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: Switch は中の button が欄になる
            <label className="flex cursor-pointer items-center gap-2 px-2 text-xs text-muted-foreground">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              エビデンス必須
            </label>
          )}
        />
        {hasError && <CircleAlert className="size-4 text-destructive" aria-hidden />}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${label}を折りたたむ`}
          onClick={() => onToggle(false)}
          disabled={hasError}
        >
          <ChevronUp aria-hidden />
        </Button>
        {menu}
      </div>
      {err?.title && <p className="px-4 pt-2 text-sm text-destructive">{err.title.message}</p>}
      <div className="grid gap-3 p-4">
        {STEP_FIELDS.map((def) => {
          const fieldErr = err?.[def.key];
          return (
            <div key={def.key} className="grid gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{def.label}</span>
                {"hint" in def && <span className="text-xs text-muted-foreground">{def.hint}</span>}
              </div>
              <Controller
                control={control}
                name={`${name}.${index}.${def.key}`}
                render={({ field }) => (
                  <VariableField
                    label={`${label}の${def.label}`}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    variables={variables}
                    mono={"mono" in def}
                    placeholder={def.placeholder}
                    invalid={!!fieldErr}
                  />
                )}
              />
              {fieldErr && <p className="text-sm text-destructive">{fieldErr.message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
