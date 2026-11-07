import {
  type ExecutionStep,
  type ProcedureStep,
  SECRET_MASK,
  STEP_STATUSES,
  type StepStatus,
} from "@tadori/shared";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FileCheck2,
  FilePlus2,
  History,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MarkdownText } from "@/features/procedures/procedure-document.tsx";
import { copyText } from "@/lib/clipboard.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { ExecText, MaskedText } from "./exec-text.tsx";
import { STEP_STATUS_META, StepStatusText } from "./execution-status.tsx";
import { useAddComment, useAddEvidence } from "./queries.ts";
import { maskInput, type RenderContext, renderPieces, textForCopy } from "./render.ts";

// S-12 のステップのカード（ui.md 8.5）。

/** 画面の中の、どのステップでも同じもの */
export type StepCardEnv = {
  executionId: string;
  ctx: RenderContext;
  /** 秘密変数があって、置き場に値がない */
  needSecrets: boolean;
  hasSecretVariables: boolean;
  /** 本人が実行中の実行を開いている（状態を変えられる） */
  operate: boolean;
  /** コメント・エビデンスを追加できる */
  append: boolean;
  /** 本人が開いている（入力を促す文を出す） */
  self: boolean;
  /** 状態の変更を送っている間は、どのステップも押せない */
  busy: boolean;
  onToggleReveal: () => void;
  onChangeStatus: (step: ExecutionStep, to: StepStatus) => void;
  onSkip: (step: ExecutionStep, label: string, title: string) => void;
  onResult: (error?: unknown) => void;
};

const STATUS_ON_CLASS: Record<StepStatus, string> = {
  pending: "data-[pressed]:bg-muted data-[pressed]:font-semibold data-[pressed]:text-foreground",
  done: "data-[pressed]:bg-success/15 data-[pressed]:font-semibold data-[pressed]:text-success",
  skipped:
    "data-[pressed]:bg-secondary data-[pressed]:font-semibold data-[pressed]:text-foreground",
  failed:
    "data-[pressed]:bg-destructive/10 data-[pressed]:font-semibold data-[pressed]:text-destructive",
};

const BORDER_CLASS: Record<StepStatus, string> = {
  pending: "before:bg-transparent",
  done: "before:bg-success",
  skipped: "before:bg-muted-foreground/40",
  failed: "before:bg-destructive",
};

/** Markdown に流す、置換した文字列（色付けはしない。秘密変数はマスクの規則どおり） */
const plainText = (text: string, ctx: RenderContext) =>
  renderPieces(text, ctx)
    .map((p) => p.text)
    .join("");

/** 「手順 3」「切り戻し 1」 */
export const stepLabel = (section: ExecutionStep["section"], index: number) =>
  `${section === "main" ? "手順" : "切り戻し"} ${index + 1}`;

export function StepCard({
  def,
  step,
  index,
  isNext,
  env,
}: {
  def: ProcedureStep;
  step: ExecutionStep;
  index: number;
  isNext: boolean;
  env: StepCardEnv;
}) {
  const evidenceMissing = def.evidenceRequired && step.evidences.length === 0;
  const rollback = step.section === "rollback";
  const label = stepLabel(step.section, index);
  return (
    <li
      id={`step-${step.stepId}`}
      className={cn(
        "relative scroll-mt-20 overflow-hidden rounded-xl border bg-card before:absolute before:inset-y-0 before:left-0 before:w-1",
        BORDER_CLASS[step.status],
        isNext && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex gap-3 p-4 pl-5">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
            step.status === "done"
              ? "bg-success/15 text-success"
              : step.status === "failed"
                ? "bg-destructive/10 text-destructive"
                : rollback
                  ? "bg-warning/15 text-warning"
                  : "bg-accent text-accent-foreground",
          )}
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={cn(
                    "font-semibold",
                    step.status === "skipped" && "text-muted-foreground",
                  )}
                >
                  <span className="sr-only">{label}. </span>
                  <ExecText text={def.title} ctx={env.ctx} />
                </h3>
                {def.evidenceRequired && (
                  <Badge variant="outline" className="border-primary/30 text-accent-foreground">
                    <Camera aria-hidden />
                    エビデンス必須
                  </Badge>
                )}
                {isNext && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-accent text-accent-foreground"
                  >
                    次のステップ
                  </Badge>
                )}
              </div>
              {step.updatedBy && step.updatedAt && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {STEP_STATUS_META[step.status].label}にした ・ {step.updatedBy.name} ・{" "}
                  {formatShortDateTime(step.updatedAt)}
                </div>
              )}
            </div>
            {env.operate ? (
              <StatusControl
                step={step}
                label={label}
                evidenceMissing={evidenceMissing}
                env={env}
                title={plainText(def.title, env.ctx)}
              />
            ) : (
              <StepStatusText status={step.status} />
            )}
          </div>
          {env.operate && evidenceMissing && step.status !== "done" && (
            <p className="mt-1 text-right text-xs text-muted-foreground">
              エビデンスを登録すると完了にできます
            </p>
          )}
          {step.status === "skipped" && step.skipReason && (
            <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-sm">
              <span className="text-muted-foreground">スキップの理由：</span>
              {step.skipReason}
            </p>
          )}
          {def.description && (
            <MarkdownText
              text={plainText(def.description, env.ctx)}
              className="mt-2 text-muted-foreground"
            />
          )}
          {def.command && <CommandBox command={def.command} env={env} />}
          {def.verification && (
            <div className="mt-2.5 flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>
                <span className="text-muted-foreground">確認：</span>
                <ExecText text={def.verification} ctx={env.ctx} />
              </span>
            </div>
          )}
          <Records step={step} label={label} env={env} />
        </div>
      </div>
    </li>
  );
}

function StatusControl({
  step,
  label,
  title,
  evidenceMissing,
  env,
}: {
  step: ExecutionStep;
  label: string;
  title: string;
  evidenceMissing: boolean;
  env: StepCardEnv;
}) {
  return (
    <ToggleGroup
      aria-label={`${label}の状態`}
      value={[step.status]}
      onValueChange={(v) => {
        const to = v[0] as StepStatus | undefined;
        // 今の状態をもう一度押したとき（選択が外れる）は何もしない
        if (!to || to === step.status) return;
        if (to === "skipped") env.onSkip(step, label, title);
        else env.onChangeStatus(step, to);
      }}
      spacing={0}
      size="sm"
      className="shrink-0 rounded-lg border bg-card p-0.5"
    >
      {STEP_STATUSES.map((s) => {
        const meta = STEP_STATUS_META[s];
        const Icon = meta.icon;
        const blocked = s === "done" && evidenceMissing && step.status !== "done";
        return (
          <ToggleGroupItem
            key={s}
            value={s}
            disabled={env.busy || blocked}
            title={blocked ? "エビデンスを登録すると完了にできます" : undefined}
            className={cn(
              "h-7 gap-1 rounded-md px-2 text-xs font-normal text-muted-foreground",
              STATUS_ON_CLASS[s],
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {meta.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function CommandBox({ command, env }: { command: string; env: StepCardEnv }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const hasSecret = renderPieces(command, env.ctx).some((p) => p.type === "secret");
  const text = textForCopy(command, env.ctx);
  const copy = async () => {
    if (text === null) return;
    try {
      await copyText(text);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyFailed(true);
    }
  };
  return (
    <>
      <div className="relative mt-2.5">
        <pre className="rounded-lg bg-muted px-3 py-2 pr-20 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">
          <ExecText text={command} ctx={env.ctx} />
        </pre>
        <div className="absolute top-1.5 right-1.5 flex gap-0.5">
          {hasSecret && env.ctx.secrets && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-card/70"
              aria-label={env.ctx.reveal ? "秘密変数を隠す" : "秘密変数を表示"}
              aria-pressed={env.ctx.reveal}
              onClick={env.onToggleReveal}
            >
              {env.ctx.reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="bg-card/70"
            disabled={text === null}
            aria-label={
              text === null
                ? "秘密変数の値を入力するとコピーできます"
                : copied
                  ? "コピーしました"
                  : "値を埋めた状態でコピー"
            }
            title={
              text === null ? "秘密変数の値を入力するとコピーできます" : "値を埋めた状態でコピー"
            }
            onClick={() => void copy()}
          >
            {text === null ? (
              <Lock aria-hidden />
            ) : copied ? (
              <Check className="text-success" aria-hidden />
            ) : (
              <Copy aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {copyFailed && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          コピーできませんでした。コマンドを選んでコピーしてください。
        </p>
      )}
      {text === null && env.self && (
        <p className="mt-1 text-xs text-warning">秘密変数の値を入力するとコピーできます</p>
      )}
    </>
  );
}

/** エビデンスの本文。マスクされた箇所を警告色の地にする */
type Kind = "comment" | "evidence";

function Records({ step, label, env }: { step: ExecutionStep; label: string; env: StepCardEnv }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composer, setComposer] = useState<Kind | null>(null);
  const records = [
    ...step.comments.map((r) => ({ ...r, kind: "comment" as const })),
    ...step.evidences.map((r) => ({ ...r, kind: "evidence" as const })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const history = step.history;
  if (records.length === 0 && history.length === 0 && !env.append) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {records.length > 0 && <span className="font-medium">記録 {records.length}</span>}
        {history.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-1 hover:text-foreground"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <History className="size-3.5" aria-hidden />
            状態の履歴 {history.length}
            {historyOpen ? (
              <ChevronUp className="size-3" aria-hidden />
            ) : (
              <ChevronDown className="size-3" aria-hidden />
            )}
          </button>
        )}
        {env.append && composer === null && (
          <span className="ml-auto flex gap-1">
            <Button variant="ghost" size="xs" onClick={() => setComposer("comment")}>
              <MessageSquarePlus aria-hidden />
              コメント
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={env.needSecrets}
              title={env.needSecrets ? "秘密変数の値を入力すると登録できます" : undefined}
              onClick={() => setComposer("evidence")}
            >
              <FilePlus2 aria-hidden />
              エビデンス
            </Button>
          </span>
        )}
      </div>
      {historyOpen && (
        <ol className="mt-2 grid gap-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          {history.map((h) => (
            <li key={h.changedAt + h.to} className="flex flex-wrap gap-x-3">
              <span className="w-20 text-muted-foreground tabular-nums">
                {formatShortDateTime(h.changedAt)}
              </span>
              <span className="w-24 truncate">{h.changedBy.name}</span>
              <span>
                {STEP_STATUS_META[h.from].label} →{" "}
                <b className={STEP_STATUS_META[h.to].className}>{STEP_STATUS_META[h.to].label}</b>
              </span>
              {h.skipReason && <span className="text-muted-foreground">（{h.skipReason}）</span>}
            </li>
          ))}
        </ol>
      )}
      {records.length > 0 && (
        <ul className="mt-2.5 grid gap-3">
          {records.map((r) => (
            <li key={r.id} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  r.kind === "evidence"
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {r.kind === "evidence" ? (
                  <FileCheck2 className="size-3.5" />
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.createdBy.name}</span> ・{" "}
                  {r.kind === "evidence" ? "エビデンス" : "コメント"} ・{" "}
                  {formatShortDateTime(r.createdAt)}
                </div>
                {r.kind === "evidence" ? (
                  <pre className="mt-1 rounded-lg bg-muted px-3 py-1.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                    <MaskedText text={r.body} />
                  </pre>
                ) : (
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                    <MaskedText text={r.body} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {composer !== null && (
        <Composer
          initialKind={composer}
          stepId={step.stepId}
          label={label}
          env={env}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}

/** 秘密変数の値を送る前にマスクすることの一文（D-02、D-56） */
export function MaskNote({
  env,
}: {
  env: Pick<StepCardEnv, "needSecrets" | "hasSecretVariables">;
}) {
  if (!env.hasSecretVariables) return null;
  return env.needSecrets ? (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
      <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      秘密変数の値が未入力のため、この欄の文字列はマスクされません。秘密の値を書かないでください
    </p>
  ) : (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
      秘密変数の値と同じ文字列は、送る前に {SECRET_MASK} に置き換えます
    </p>
  );
}

function Composer({
  initialKind,
  stepId,
  label,
  env,
  onClose,
}: {
  initialKind: Kind;
  stepId: string;
  label: string;
  env: StepCardEnv;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [body, setBody] = useState("");
  const addComment = useAddComment(env.executionId);
  const addEvidence = useAddEvidence(env.executionId);
  const pending = addComment.isPending || addEvidence.isPending;
  const evidence = kind === "evidence";
  const empty = body.trim() === "";
  const blocked = evidence && env.needSecrets;

  const submit = () => {
    if (empty || blocked) return;
    const masked = maskInput(body, env.ctx.secrets);
    const mutation = evidence ? addEvidence : addComment;
    mutation.mutate(
      { stepId, body: masked },
      {
        onSuccess: () => {
          env.onResult();
          onClose();
        },
        onError: (e) => env.onResult(e),
      },
    );
  };

  const tab = (k: Kind, text: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === k}
      disabled={pending || (k === "evidence" && env.needSecrets)}
      onClick={() => setKind(k)}
      className={cn(
        "-mb-px border-b-2 border-transparent px-2 pb-1.5 text-sm text-muted-foreground disabled:opacity-50",
        kind === k && "border-primary font-medium text-foreground",
      )}
    >
      {text}
    </button>
  );

  const fieldId = `composer-${stepId}`;
  return (
    <div className="mt-3 rounded-lg border bg-card p-3">
      <div role="tablist" className="flex gap-3 border-b">
        {tab("comment", "コメント")}
        {tab("evidence", "エビデンス")}
      </div>
      <label htmlFor={fieldId} className="sr-only">
        {label}の{evidence ? "エビデンス" : "コメント"}
      </label>
      <Textarea
        id={fieldId}
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={evidence ? "コマンドの出力などを貼り付け" : "気づいたこと・判断の理由など"}
        className={cn("mt-2 h-24", evidence && "font-mono text-[13px]")}
      />
      {evidence && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          パスワードや鍵などの秘密情報を貼り付けないでください。登録した後は消せません。
        </p>
      )}
      <MaskNote env={env} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onClose}>
          キャンセル
        </Button>
        <Button size="sm" disabled={pending || empty || blocked} onClick={submit}>
          登録する
        </Button>
      </div>
    </div>
  );
}
