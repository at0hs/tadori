import {
  type ApprovalEvent,
  type ExecutionDetailResponse,
  progressOf,
  SECRET_MASK,
  type StepStatus,
} from "@tadori/shared";
import {
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Send,
  Stamp,
  Undo2,
  Variable,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionTitle } from "@/features/procedures/editor/sections.tsx";
import { isApiError } from "@/lib/api.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { STEP_STATUS_META } from "./execution-status.tsx";
import { useUpdateVariables } from "./queries.ts";

// S-12 の右の列（ui.md 8.4・8.6）：進捗・変数・承認の履歴。

const SEGMENT_CLASS: Record<StepStatus, string> = {
  done: "bg-success",
  skipped: "bg-muted-foreground/40",
  failed: "bg-destructive",
  pending: "bg-muted",
};

export function ProgressCard({
  detail,
  nextStepId,
}: {
  detail: ExecutionDetailResponse;
  nextStepId: string | undefined;
}) {
  const main = detail.steps.filter((s) => s.section === "main");
  const rollback = detail.steps.filter((s) => s.section === "rollback");
  const { done, total } = progressOf(detail.steps);
  const count = (k: StepStatus) => main.filter((s) => s.status === k).length;
  const titles = new Map(
    [...detail.content.steps, ...detail.content.rollbackSteps].map((s) => [s.id, s.title]),
  );
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="進捗">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">進捗</span>
        <span className="ml-1 text-3xl font-semibold tabular-nums">{done}</span>
        <span className="text-muted-foreground tabular-nums">/ {total}</span>
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {main.map((s) => (
          <span key={s.stepId} className={cn("flex-1", SEGMENT_CLASS[s.status])} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(["done", "skipped", "failed", "pending"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                "size-1.5 rounded-full",
                k === "pending" ? "bg-muted-foreground/30" : SEGMENT_CLASS[k],
              )}
              aria-hidden
            />
            {STEP_STATUS_META[k].label} {count(k)}
          </span>
        ))}
      </div>
      <ol className="mt-3 grid gap-0.5 border-t pt-2">
        {main.map((s, i) => {
          const meta = STEP_STATUS_META[s.status];
          const Icon = meta.icon;
          return (
            <li key={s.stepId}>
              <a
                href={`#step-${s.stepId}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  s.stepId === nextStepId && "bg-accent font-medium text-accent-foreground",
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", meta.className)} aria-label={meta.label} />
                <span className="w-4 text-right text-xs tabular-nums">{i + 1}</span>
                <span className="truncate">{titles.get(s.stepId)}</span>
              </a>
            </li>
          );
        })}
        {rollback.length > 0 && (
          <li className="mt-1 border-t pt-1">
            <a
              href="#rollback"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Undo2 className="size-3.5 shrink-0 text-warning" aria-hidden />
              <span className="truncate">切り戻し手順</span>
              <span className="ml-auto text-xs tabular-nums">
                {rollback.filter((s) => s.status !== "pending").length} / {rollback.length}
              </span>
            </a>
          </li>
        )}
      </ol>
    </section>
  );
}

type VarForm = { values: Record<string, string> };

export function VariablesCard({
  detail,
  operate,
  self,
  secrets,
  reveal,
  promptSecrets,
  onToggleReveal,
  onEnterSecrets,
  onResult,
}: {
  detail: ExecutionDetailResponse;
  /** 本人が実行中の実行を開いている */
  operate: boolean;
  self: boolean;
  secrets: Readonly<Record<string, string>> | undefined;
  reveal: boolean;
  /** 秘密変数の値の入力を促す（本人・入力が要る操作が残っている・置き場が空） */
  promptSecrets: boolean;
  onToggleReveal: () => void;
  onEnterSecrets: () => void;
  onResult: (error?: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const defs = detail.content.variables;
  const editable = operate && !detail.variablesLocked;
  const update = useUpdateVariables(detail.id);
  const plainDefs = defs.filter((v) => !v.secret);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<VarForm>({
    values: {
      values: Object.fromEntries(plainDefs.map((v) => [v.name, detail.variables[v.name] ?? ""])),
    },
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = ({ values }: VarForm) => {
    update.mutate(values, {
      onSuccess: () => {
        onResult();
        setEditing(false);
      },
      onError: (e) => {
        const fieldErrors = isApiError(e, "VALIDATION_FAILED")
          ? e.errors.flatMap((fe) => {
              const name = fe.path.startsWith("variables.") ? fe.path.slice(10) : null;
              return name && plainDefs.some((v) => v.name === name)
                ? [{ name, message: fe.message }]
                : [];
            })
          : [];
        if (fieldErrors.length > 0) {
          for (const fe of fieldErrors) setError(`values.${fe.name}`, { message: fe.message });
        } else {
          onResult(e);
          setEditing(false);
        }
      },
    });
  };

  if (defs.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <SectionTitle icon={Variable}>変数</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">変数はありません</p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-xl border bg-card p-4"
      aria-label="変数"
    >
      <div className="flex items-center gap-2">
        <SectionTitle icon={Variable}>変数</SectionTitle>
        {detail.variablesLocked ? (
          <Badge
            variant="outline"
            className="ml-auto text-muted-foreground"
            title="最初のステップの状態を変えた後は、値を変更できません"
          >
            <Lock aria-hidden />
            確定
          </Badge>
        ) : (
          editable &&
          !editing &&
          plainDefs.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
              直す
            </Button>
          )
        )}
      </div>
      <div className="mt-1 divide-y">
        {defs.map((v) => {
          const id = `exec-var-${v.name}`;
          const error = errors.values?.[v.name]?.message;
          let value: React.ReactNode;
          if (v.secret) {
            const secret = secrets?.[v.name];
            value =
              secret !== undefined && self ? (
                <span className="flex items-center gap-1">
                  <span className={cn("font-mono text-[13px]", !reveal && "tracking-wider")}>
                    {reveal ? secret : SECRET_MASK}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={reveal ? "秘密変数を隠す" : "秘密変数を表示"}
                    aria-pressed={reveal}
                    onClick={onToggleReveal}
                  >
                    {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                </span>
              ) : promptSecrets ? (
                <span className="text-xs text-warning">未入力</span>
              ) : (
                <span className="font-mono text-[13px] text-muted-foreground">{SECRET_MASK}</span>
              );
          } else if (editing) {
            value = (
              <>
                <Input
                  id={id}
                  aria-label={`#{${v.name}}`}
                  aria-invalid={!!error}
                  className="h-7 font-mono text-[13px]"
                  autoComplete="off"
                  {...register(`values.${v.name}`, {
                    required: "値を入力してください。",
                    maxLength: { value: 1000, message: "値は1000文字以内にしてください。" },
                  })}
                />
                {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
              </>
            );
          } else {
            value = (
              <span className="font-mono text-[13px] break-all">{detail.variables[v.name]}</span>
            );
          }
          return (
            <div key={v.name} className="py-2">
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 font-mono whitespace-nowrap">#{`{${v.name}}`}</span>
                {v.secret && (
                  <Lock className="size-3 shrink-0 text-warning" aria-label="秘密変数" />
                )}
                <span className="truncate">{v.description}</span>
              </div>
              <div className="mt-0.5">{value}</div>
            </div>
          );
        })}
      </div>
      {editing && (
        <>
          <div className="mt-2 flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={() => {
                reset();
                setEditing(false);
              }}
            >
              キャンセル
            </Button>
            <Button type="submit" size="sm" disabled={update.isPending}>
              保存
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            最初のステップの状態を変えると、値は直せなくなります
          </p>
        </>
      )}
      {detail.variablesLocked && operate && (
        <p className="mt-1 text-xs text-muted-foreground">
          最初のステップの状態を変えたので、値は直せません
        </p>
      )}
      {promptSecrets && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={onEnterSecrets}
        >
          <KeyRound aria-hidden />
          秘密変数の値を入力
        </Button>
      )}
    </form>
  );
}

const APPROVAL_EVENT_META = {
  requested: { icon: Send, className: "bg-accent text-accent-foreground" },
  approved: { icon: BadgeCheck, className: "bg-success/15 text-success" },
  rejected: { icon: Undo2, className: "bg-destructive/10 text-destructive" },
} as const;

export function ApprovalsCard({ approvals }: { approvals: ApprovalEvent[] }) {
  if (approvals.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card p-4">
      <SectionTitle icon={Stamp}>承認の履歴</SectionTitle>
      <ol className="mt-3 grid gap-3">
        {approvals.map((a, i) => {
          const meta = APPROVAL_EVENT_META[a.kind];
          const Icon = meta.icon;
          const label =
            a.kind === "requested"
              ? i === 0
                ? "承認を依頼（終了）"
                : "再依頼"
              : a.kind === "approved"
                ? "承認"
                : "差し戻し";
          return (
            <li key={a.occurredAt + a.kind} className="flex gap-2.5">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full",
                  meta.className,
                )}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div>
                  <span className="font-medium">{label}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {a.actor.name} ・ {formatShortDateTime(a.occurredAt)}
                  </span>
                </div>
                {a.comment && (
                  <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-sm whitespace-pre-wrap">
                    {a.comment}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
