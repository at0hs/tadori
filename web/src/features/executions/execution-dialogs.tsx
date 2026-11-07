import {
  type ExecutionDetailResponse,
  type ExecutionStep,
  finishOutcome,
  progressOf,
  SECRET_MIN_LENGTH,
} from "@tadori/shared";
import {
  BadgeCheck,
  Ban,
  CircleAlert,
  Flag,
  KeyRound,
  type LucideIcon,
  Send,
  SkipForward,
  Undo2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorBanner } from "@/components/error-banner.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api.ts";
import { cn } from "@/lib/utils";
import type { DialogState } from "./execution-page.tsx";
import { ExecutionStatusLabel } from "./execution-status.tsx";
import {
  useApproveExecution,
  useCancelExecution,
  useChangeStepStatus,
  useFinishExecution,
  useRejectExecution,
  useResubmitExecution,
} from "./queries.ts";
import { maskReason, type RenderContext, renderPieces } from "./render.ts";
import { SecretInput } from "./secret-input.tsx";
import { setSecrets } from "./secret-store.ts";
import { MaskNote, stepLabel } from "./step-card.tsx";

// S-12 のダイアログ（ui.md 8.7）。送っている間は閉じられない（ボタンも Esc も）。
// 操作の失敗は画面の帯に出す（ステップの状態の競合・ほかの人の操作による STATE_CONFLICT など）。

type Tone = "primary" | "destructive" | "warning" | "success";

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-accent text-accent-foreground",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
};

const DESTRUCTIVE_BUTTON = "bg-destructive text-destructive-foreground hover:bg-destructive/85";

function Shell({
  open,
  pending,
  onClose,
  icon: Icon,
  tone,
  title,
  description,
  children,
  onSubmit,
  okLabel,
  okDestructive,
  okDisabled,
  cancelLabel = "キャンセル",
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  icon: LucideIcon;
  tone: Tone;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  okLabel?: string;
  okDestructive?: boolean;
  okDisabled?: boolean;
  cancelLabel?: string;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <form className="grid gap-4" noValidate onSubmit={onSubmit ?? ((e) => e.preventDefault())}>
          <div className="flex gap-3">
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                TONE_CLASS[tone],
              )}
            >
              <Icon className="size-4" aria-hidden />
            </div>
            <div className="grid gap-1">
              <AlertDialogTitle className="font-semibold">{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </div>
          </div>
          {children}
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogCancel variant="ghost" disabled={pending}>
              {cancelLabel}
            </AlertDialogCancel>
            {okLabel && (
              <Button
                type="submit"
                className={okDestructive ? DESTRUCTIVE_BUTTON : undefined}
                disabled={pending || okDisabled}
              >
                {okLabel}
              </Button>
            )}
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReasonField({
  label,
  required,
  value,
  onChange,
  error,
  placeholder,
  hint,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}{" "}
        <span
          className={cn(
            "text-xs font-normal",
            required ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {required ? "必須" : "任意"}
        </span>
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        className="h-20"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 理由・コメントの検証（スキップ・中止は 1000、差し戻し・再依頼は 5000。api.md 6章の上限） */
function checkReason(
  text: string,
  required: boolean,
  what: string,
  max = 1000,
): string | undefined {
  const t = text.trim();
  if (required && t === "") return `${what}を入力してください。`;
  if (t.length > max) return `${what}は${max}文字以内にしてください。`;
  return undefined;
}

/**
 * 差し戻し・再依頼の送信の失敗のうち、ダイアログを閉じて帯に出すもの（ほかの人の操作で状態が変わったなど、
 * 送り直しても通らないもの）。それ以外（サーバーのエラー・通信の失敗・セッション切れ）は、書いたコメントを
 * 残すためにダイアログを開いたまま中に出す。
 */
function closesDialog(err: unknown): boolean {
  return (["STATE_CONFLICT", "FORBIDDEN", "NOT_FOUND"] as const).some((c) => isApiError(err, c));
}

function dialogErrorMessage(err: unknown): string | undefined {
  if (isApiError(err, "UNAUTHENTICATED")) {
    return "ログインの有効期限が切れました。コメントを控えてから別のタブでログインし直し、もう一度送ってください。";
  }
  return isApiError(err) ? err.message : undefined;
}

type Env = {
  detail: ExecutionDetailResponse;
  ctx: RenderContext;
  needSecrets: boolean;
  hasSecretVariables: boolean;
  onResult: (error?: unknown) => void;
};

/** 開いているダイアログを出す（execution-page.tsx から） */
export function ExecutionDialogs({
  dialog,
  onClose,
  env,
}: {
  dialog: DialogState;
  onClose: () => void;
  env: Env;
}) {
  if (dialog === null) return null;
  switch (dialog.kind) {
    case "secrets":
      return <SecretInputDialog env={env} onClose={onClose} />;
    case "skip":
      return (
        <SkipDialog
          env={env}
          step={dialog.step}
          label={dialog.label}
          title={dialog.title}
          onClose={onClose}
        />
      );
    case "finish":
      return <FinishDialog env={env} onClose={onClose} />;
    case "cancel":
      return <CancelDialog env={env} mode={dialog.mode} onClose={onClose} />;
    case "approve":
      return <ApproveDialog env={env} onClose={onClose} />;
    case "reject":
      return <RejectDialog env={env} onClose={onClose} />;
    case "resubmit":
      return <ResubmitDialog env={env} onClose={onClose} />;
  }
}

type SecretForm = { values: Record<string, string> };

/** 秘密変数の値の入力（D-01、D-41）。サーバーには送らず、置き場に入れるだけ */
export function SecretInputDialog({ env, onClose }: { env: Env; onClose: () => void }) {
  const defs = env.detail.content.variables.filter((v) => v.secret);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SecretForm>({
    defaultValues: { values: Object.fromEntries(defs.map((v) => [v.name, ""])) },
  });
  return (
    <Shell
      open
      pending={false}
      onClose={onClose}
      icon={KeyRound}
      tone="warning"
      title="秘密変数の値を入力"
      description="このタブの中だけに置き、サーバーには送りません。再読み込みやタブを閉じると消えます。"
      onSubmit={handleSubmit(({ values }) => {
        setSecrets(env.detail.id, values);
        onClose();
      })}
      okLabel="入力する"
    >
      {defs.map((v) => {
        const id = `secret-${v.name}`;
        const error = errors.values?.[v.name]?.message;
        return (
          <div key={v.name} className="grid gap-1.5">
            <Label htmlFor={id}>
              <span className="font-mono">#{`{${v.name}}`}</span>{" "}
              <span className="text-xs font-normal text-muted-foreground">{v.description}</span>
            </Label>
            <SecretInput
              id={id}
              aria-invalid={!!error}
              {...register(`values.${v.name}`, {
                required: "値を入力してください。",
                minLength: {
                  value: SECRET_MIN_LENGTH,
                  message: `${SECRET_MIN_LENGTH} 文字以上で入力してください。`,
                },
              })}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              最初に入力した値と同じかどうかは確かめません
            </p>
          </div>
        );
      })}
    </Shell>
  );
}

export function SkipDialog({
  env,
  step,
  label,
  title,
  onClose,
}: {
  env: Env;
  step: ExecutionStep;
  label: string;
  title: string;
  onClose: () => void;
}) {
  const change = useChangeStepStatus(env.detail.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Shell
      open
      pending={change.isPending}
      onClose={onClose}
      icon={SkipForward}
      tone="primary"
      title={`${label}「${title}」をスキップしますか？`}
      description="スキップの理由を残します。理由は実行の記録と Excel に出ます。"
      onSubmit={(e) => {
        e.preventDefault();
        const message = checkReason(reason, true, "スキップの理由");
        setError(message);
        if (message) return;
        change.mutate(
          {
            stepId: step.stepId,
            from: step.status,
            to: "skipped",
            skipReason: maskReason(reason, env.ctx.secrets),
          },
          {
            onSuccess: () => env.onResult(),
            onError: (err) => env.onResult(err),
            onSettled: onClose,
          },
        );
      }}
      okLabel="スキップにする"
    >
      <div>
        <ReasonField
          label="理由"
          required
          value={reason}
          onChange={(v) => {
            setReason(v);
            setError(undefined);
          }}
          error={error}
          placeholder="例：設定の変更がなかったため再読み込みは不要"
        />
        <MaskNote env={env} />
      </div>
    </Shell>
  );
}

/** 置換した文字列（色付けなし） */
const plain = (text: string, ctx: RenderContext) =>
  renderPieces(text, ctx)
    .map((p) => p.text)
    .join("");

export function FinishDialog({ env, onClose }: { env: Env; onClose: () => void }) {
  const finish = useFinishExecution(env.detail.id);
  const { steps, content } = env.detail;
  // 画面が持っている状態で判定して出し分ける。実際の判定はサーバーが行う（ui.md 8.7）
  const outcome = finishOutcome(steps);
  const titles = new Map([...content.steps, ...content.rollbackSteps].map((s) => [s.id, s.title]));
  const main = steps.filter((s) => s.section === "main");
  const rollback = steps.filter((s) => s.section === "rollback");
  const name = (s: ExecutionStep) => {
    const list = s.section === "main" ? main : rollback;
    return `${stepLabel(s.section, list.indexOf(s))}「${plain(titles.get(s.stepId) ?? "", env.ctx)}」`;
  };
  const count = (k: ExecutionStep["status"]) => main.filter((s) => s.status === k).length;
  const rollbackDone = rollback.filter((s) => s.status === "done" || s.status === "failed");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    finish.mutate(undefined, {
      onSuccess: () => env.onResult(),
      onError: (err) => env.onResult(err),
      onSettled: onClose,
    });
  };

  if (outcome === null) {
    const pending = main.filter((s) => s.status === "pending");
    return (
      <Shell
        open
        pending={false}
        onClose={onClose}
        icon={CircleAlert}
        tone="warning"
        title="まだ終了できません"
        description="手順に未実施のステップが残っていて、失敗も切り戻しもありません。"
        cancelLabel="閉じる"
      >
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          未実施：{pending.map((s) => stepLabel("main", main.indexOf(s))).join("・")}
          <p className="mt-1 text-muted-foreground">
            ステップを完了かスキップにすると、完了として終了できます。作業をやめるときは「中止する」を選んでください。
          </p>
        </div>
      </Shell>
    );
  }

  if (outcome === "abnormal") {
    const failed = main.filter((s) => s.status === "failed");
    return (
      <Shell
        open
        pending={finish.isPending}
        onClose={onClose}
        icon={Flag}
        tone="destructive"
        title="異常終了として終了しますか？"
        description="終了すると承認待ちになり、ステップの状態は変えられなくなります。"
        onSubmit={submit}
        okLabel="異常終了として終了"
        okDestructive
      >
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          異常終了になる理由
          <ul className="mt-1 list-disc pl-5">
            {failed.length > 0 && (
              <li>失敗したステップがあります：{failed.map(name).join("、")}</li>
            )}
            {rollbackDone.length > 0 && (
              <li>切り戻し手順を実施しました：{rollbackDone.map(name).join("、")}</li>
            )}
          </ul>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      open
      pending={finish.isPending}
      onClose={onClose}
      icon={Flag}
      tone="success"
      title="完了として終了しますか？"
      description="終了すると承認待ちになり、ステップの状態は変えられなくなります。"
      onSubmit={submit}
      okLabel="完了として終了"
    >
      <div className="rounded-lg bg-muted px-4 py-3 text-sm">
        手順{" "}
        <b>
          {count("done") + count("skipped")} / {main.length}
        </b>
        （完了 {count("done")}・スキップ {count("skipped")}）・ 失敗 {count("failed")}
        <br />
        切り戻し手順は実施していません
      </div>
    </Shell>
  );
}

export function CancelDialog({
  env,
  mode,
  onClose,
}: {
  env: Env;
  mode: "executor" | "admin";
  onClose: () => void;
}) {
  const cancel = useCancelExecution(env.detail.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const admin = mode === "admin";
  return (
    <Shell
      open
      pending={cancel.isPending}
      onClose={onClose}
      icon={Ban}
      tone="destructive"
      title={admin ? "管理者としてこの実行を中止しますか？" : "この実行を中止しますか？"}
      description={
        admin
          ? `実行者の ${env.detail.executor.name} は無効化されているか、実行者ロールを持っていないため、管理者が中止できます。元に戻せません。`
          : "中止すると、ステップの状態は変えられず、承認にも進みません。元に戻せません。"
      }
      onSubmit={(e) => {
        e.preventDefault();
        const message = checkReason(reason, admin, "中止の理由");
        setError(message);
        if (message) return;
        // 送る前にマスクする（D-56）。管理者として中止するときも、このタブに値があれば隠す
        // （管理者が実行者を兼ねていて、実行者ロールを外された場合など）
        const body = maskReason(reason, env.ctx.secrets);
        cancel.mutate(body, {
          onSuccess: () => env.onResult(),
          onError: (err) => env.onResult(err),
          onSettled: onClose,
        });
      }}
      okLabel="中止する"
      okDestructive
    >
      <div>
        <ReasonField
          label="理由"
          required={admin}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setError(undefined);
          }}
          error={error}
          placeholder={
            admin ? undefined : "例：メンテナンス時間内に終わらないため、別の日にやり直す"
          }
          hint={admin ? "実行の記録と操作ログに残ります" : undefined}
        />
        {!admin && <MaskNote env={env} />}
      </div>
    </Shell>
  );
}

/** 承認の確認（ui.md 8.7）。承認すると誰も変更できなくなる */
export function ApproveDialog({ env, onClose }: { env: Env; onClose: () => void }) {
  const approve = useApproveExecution(env.detail.id);
  const { done, total } = progressOf(env.detail.steps);
  return (
    <Shell
      open
      pending={approve.isPending}
      onClose={onClose}
      icon={BadgeCheck}
      tone="success"
      title="この実行を承認しますか？"
      description="承認すると、この実行の記録は誰も変更できなくなります。"
      onSubmit={(e) => {
        e.preventDefault();
        approve.mutate(undefined, {
          onSuccess: () => env.onResult(),
          onError: (err) => env.onResult(err),
          onSettled: onClose,
        });
      }}
      okLabel="承認する"
    >
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 rounded-lg bg-muted px-4 py-3 text-sm">
        <dt className="text-muted-foreground">状態</dt>
        <dd>
          <ExecutionStatusLabel status={env.detail.status} />
        </dd>
        <dt className="text-muted-foreground">進捗</dt>
        <dd>
          <b>
            {done} / {total}
          </b>
        </dd>
        <dt className="text-muted-foreground">実行者</dt>
        <dd>{env.detail.executor.name}</dd>
      </dl>
    </Shell>
  );
}

/** 差し戻し（ui.md 8.7）。コメントは必須。承認者が書くのでマスクしない */
export function RejectDialog({ env, onClose }: { env: Env; onClose: () => void }) {
  const reject = useRejectExecution(env.detail.id);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<unknown>();
  return (
    <Shell
      open
      pending={reject.isPending}
      onClose={onClose}
      icon={Undo2}
      tone="destructive"
      title="差し戻しますか？"
      description="実行者はコメントとエビデンスを追記して、再依頼できます。ステップの状態は変えられません。"
      onSubmit={(e) => {
        e.preventDefault();
        const message = checkReason(comment, true, "コメント", 5000);
        setError(message);
        if (message) return;
        setFailure(undefined);
        reject.mutate(comment.trim(), {
          onSuccess: () => {
            env.onResult();
            onClose();
          },
          onError: (err) => {
            if (!closesDialog(err)) return setFailure(err);
            env.onResult(err);
            onClose();
          },
        });
      }}
      okLabel="差し戻す"
      okDestructive
    >
      {failure !== undefined && (
        <ErrorBanner error={failure} message={dialogErrorMessage(failure)} />
      )}
      <ReasonField
        label="コメント"
        required
        value={comment}
        onChange={(v) => {
          setComment(v);
          setError(undefined);
        }}
        error={error}
        placeholder="例：手順 2 のエビデンスに、設定を確かめた結果を貼ってください"
      />
    </Shell>
  );
}

/** 再依頼（ui.md 8.7、D-31）。コメントは必須で、送る前にマスクする（D-56） */
export function ResubmitDialog({ env, onClose }: { env: Env; onClose: () => void }) {
  const resubmit = useResubmitExecution(env.detail.id);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<unknown>();
  return (
    <Shell
      open
      pending={resubmit.isPending}
      onClose={onClose}
      icon={Send}
      tone="primary"
      title="再依頼しますか？"
      description="承認待ちに戻り、承認か差し戻しが決まるまでコメントとエビデンスは追記できなくなります。"
      onSubmit={(e) => {
        e.preventDefault();
        const message = checkReason(comment, true, "コメント", 5000);
        setError(message);
        if (message) return;
        setFailure(undefined);
        resubmit.mutate(maskReason(comment, env.ctx.secrets), {
          onSuccess: () => {
            env.onResult();
            onClose();
          },
          onError: (err) => {
            if (!closesDialog(err)) return setFailure(err);
            env.onResult(err);
            onClose();
          },
        });
      }}
      okLabel="再依頼する"
    >
      {failure !== undefined && (
        <ErrorBanner error={failure} message={dialogErrorMessage(failure)} />
      )}
      <div>
        <ReasonField
          label="コメント"
          required
          value={comment}
          onChange={(v) => {
            setComment(v);
            setError(undefined);
          }}
          error={error}
          placeholder="例：手順 2 のエビデンスを追記しました"
        />
        <MaskNote env={env} />
      </div>
    </Shell>
  );
}
