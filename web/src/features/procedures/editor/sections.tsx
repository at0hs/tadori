import type { ProcedureContent } from "@tadori/shared";
import { FileText, ListTodo, Lock, Plus, Trash2, Variable } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { Field } from "@/components/field.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TagInput } from "./tag-input.tsx";

// 編集画面の、基本情報・前提条件・変数の区画（ui.md 7.5）。

export function SectionTitle({
  icon: Icon,
  children,
  iconClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  iconClass?: string;
}) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <Icon className={cn("size-4 text-muted-foreground", iconClass)} aria-hidden />
      {children}
    </h2>
  );
}

const Required = () => <span className="text-xs font-normal text-destructive">必須</span>;

export function BasicSection({ tagSuggestions }: { tagSuggestions: string[] }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ProcedureContent>();
  return (
    <section id="sec-basic" className="scroll-mt-48 rounded-xl border bg-card p-5">
      <SectionTitle icon={FileText}>基本情報</SectionTitle>
      <div className="mt-4 grid gap-4">
        <Field
          label={
            <>
              タイトル <Required />
            </>
          }
          htmlFor="title"
          error={errors.title?.message}
        >
          <Input
            id="title"
            placeholder="例：nginx の設定変更"
            aria-invalid={errors.title ? true : undefined}
            {...register("title")}
          />
        </Field>
        <Field label="概要" htmlFor="summary" error={errors.summary?.message}>
          <Input
            id="summary"
            placeholder="何のための手順書か（任意）"
            aria-invalid={errors.summary ? true : undefined}
            {...register("summary")}
          />
        </Field>
        <Field
          label="タグ"
          htmlFor="tags"
          error={errors.tags?.message ?? errors.tags?.find?.((e) => e)?.message}
        >
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagInput
                id="tags"
                value={field.value}
                onChange={field.onChange}
                suggestions={tagSuggestions}
                invalid={!!errors.tags}
              />
            )}
          />
        </Field>
      </div>
    </section>
  );
}

export function PrerequisitesSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProcedureContent>();
  return (
    <section id="sec-pre" className="scroll-mt-48 rounded-xl border bg-card p-5">
      <SectionTitle icon={ListTodo}>前提条件</SectionTitle>
      <div className="mt-3 grid gap-1.5">
        <Textarea
          aria-label="前提条件"
          placeholder="作業を始める前に満たしておくこと（任意。Markdown で書けます）"
          className="bg-card"
          aria-invalid={errors.prerequisites ? true : undefined}
          {...register("prerequisites")}
        />
        {errors.prerequisites && (
          <p className="text-sm text-destructive">{errors.prerequisites.message}</p>
        )}
      </div>
    </section>
  );
}

const VAR_GRID = "grid grid-cols-[12rem_1fr_12rem_4rem_2rem] items-start gap-2";

export function VariablesSection() {
  const {
    register,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<ProcedureContent>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "variables",
    keyName: "fieldKey",
  });

  return (
    <section id="sec-var" className="scroll-mt-48 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <SectionTitle icon={Variable}>変数</SectionTitle>
        <span className="text-xs text-muted-foreground">
          説明・コマンド・確認方法で #{"{"}変数名{"}"} と書くと、実行のときに値に置き換わります
        </span>
      </div>
      {fields.length > 0 && (
        <div className="mt-3 grid gap-2">
          <div className={cn(VAR_GRID, "text-xs text-muted-foreground")}>
            <span>名前（英数字・_・-）</span>
            <span>説明</span>
            <span>既定値</span>
            <span className="text-center">秘密</span>
            <span />
          </div>
          {fields.map((f, i) => {
            const secret = watch(`variables.${i}.secret`);
            const err = errors.variables?.[i];
            return (
              <div key={f.fieldKey} className="grid gap-1">
                <div className={VAR_GRID}>
                  {/* 名前だけを入力する。#{ と } は欄の外の固定の飾り（ui.md 7.5） */}
                  <div
                    className={cn(
                      "flex h-8 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40",
                      err?.name && "border-destructive ring-3 ring-destructive/20",
                    )}
                  >
                    <span
                      className="grid place-items-center border-r bg-muted px-2 font-mono text-[13px] text-muted-foreground select-none"
                      aria-hidden
                    >
                      #{"{"}
                    </span>
                    <input
                      aria-label={`変数 ${i + 1} の名前`}
                      aria-invalid={err?.name ? true : undefined}
                      placeholder="name"
                      className="min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
                      {...register(`variables.${i}.name`)}
                    />
                    <span
                      className="grid place-items-center border-l bg-muted px-2 font-mono text-[13px] text-muted-foreground select-none"
                      aria-hidden
                    >
                      {"}"}
                    </span>
                  </div>
                  <Input
                    aria-label={`変数 ${i + 1} の説明`}
                    aria-invalid={err?.description ? true : undefined}
                    {...register(`variables.${i}.description`)}
                  />
                  {secret ? (
                    <span className="flex h-8 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden />
                      秘密変数は既定値なし
                    </span>
                  ) : (
                    <Controller
                      control={control}
                      name={`variables.${i}.default`}
                      render={({ field }) => (
                        <Input
                          aria-label={`変数 ${i + 1} の既定値`}
                          className="font-mono text-[13px]"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.value)
                          }
                          onBlur={field.onBlur}
                        />
                      )}
                    />
                  )}
                  <span className="flex h-8 items-center justify-center">
                    <Controller
                      control={control}
                      name={`variables.${i}.secret`}
                      render={({ field }) => (
                        <Switch
                          aria-label={`変数 ${i + 1} を秘密変数にする`}
                          checked={field.value}
                          onCheckedChange={(on) => {
                            field.onChange(on);
                            // 秘密変数は既定値を持たない（D-26）
                            if (on) setValue(`variables.${i}.default`, null, { shouldDirty: true });
                          }}
                        />
                      )}
                    />
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`変数 ${i + 1} を削除`}
                    onClick={() => remove(i)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {(err?.name || err?.default || err?.description) && (
                  <p className="text-sm text-destructive">
                    {err.name?.message ?? err.default?.message ?? err.description?.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        className="mt-2 text-muted-foreground"
        onClick={() => append({ name: "", description: "", default: null, secret: false })}
      >
        <Plus aria-hidden />
        変数を追加
      </Button>
    </section>
  );
}
