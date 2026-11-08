import {
  can,
  type ExecutionDetailResponse,
  type ExecutionStep,
  type MeResponse,
  type StepStatus,
  type StepStatusConflict,
} from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Ellipsis,
  ExternalLink,
  FileSpreadsheet,
  Flag,
  Hourglass,
  KeyRound,
  ListOrdered,
  ListX,
  Send,
  Undo2,
  UserX,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/me/queries.ts";
import { SectionTitle } from "@/features/procedures/editor/sections.tsx";
import { isApiError } from "@/lib/api.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { approvalAction } from "./approval-action.ts";
import { exportPlacement } from "./download.ts";
import { ExecutionDialogs } from "./execution-dialogs.tsx";
import { ApprovalsCard, ProgressCard, VariablesCard } from "./execution-rail.tsx";
import {
  ApprovalBadge,
  Avatar,
  ExecutionStatusLabel,
  STEP_STATUS_META,
} from "./execution-status.tsx";
import { executionQueryOptions, useChangeStepStatus, useExportExecution } from "./queries.ts";
import type { RenderContext } from "./render.ts";
import { useSecrets } from "./secret-store.ts";
import { StepCard, type StepCardEnv, stepLabel } from "./step-card.tsx";

// S-12 実行（ui.md 8.4〜8.8、案2）。Excel（F-09）の操作は、それを作るときに足す。

/** 本人：その実行を開始し、今も作業者以上のロールを持つ人（D-35） */
export function canOperate(detail: ExecutionDetailResponse, me: MeResponse): boolean {
  return detail.executor.id === me.id && can(me.role, "execute");
}

/** コメント・エビデンスを追加できる：本人で、実行中か差し戻し */
export function canAppend(detail: ExecutionDetailResponse, me: MeResponse): boolean {
  return (
    canOperate(detail, me) && (detail.status === "running" || detail.approvalStatus === "rejected")
  );
}

/** 開いているダイアログ（execution-dialogs.tsx） */
export type DialogState =
  | { kind: "secrets" }
  | { kind: "skip"; step: ExecutionStep; label: string; title: string }
  | { kind: "finish" }
  | { kind: "cancel"; mode: "executor" | "admin" }
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "resubmit" }
  | null;

export function ExecutionPage({ executionId }: { executionId: string }) {
  const { data, error, isPending } = useQuery(executionQueryOptions(executionId));
  if (isApiError(error, "NOT_FOUND")) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={ListX} title="実行が見つかりません" />
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} />;
  if (isPending) return <ExecutionSkeleton />;
  return <ExecutionView detail={data} />;
}

function ExecutionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-4 w-96" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_17rem]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}

function ExecutionView({ detail }: { detail: ExecutionDetailResponse }) {
  const me = useMe();
  const secrets = useSecrets(detail.id);
  // 秘密変数の表示は画面の中でまとめて切り替え、画面を移ると隠した状態に戻る（ui.md 8.6）
  const [reveal, setReveal] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const changeStatus = useChangeStepStatus(detail.id);
  const exportExecution = useExportExecution(detail.id);

  const self = detail.executor.id === me.id;
  const owner = canOperate(detail, me);
  const operate = owner && detail.status === "running";
  const append = canAppend(detail, me);
  const action = approvalAction(detail, me);
  const secretNames = detail.content.variables.filter((v) => v.secret).map((v) => v.name);
  const hasSecretVariables = secretNames.length > 0;
  const needSecrets = hasSecretVariables && secrets === undefined;
  const promptSecrets = owner && needSecrets && append;
  const ctx: RenderContext = { values: detail.variables, secretNames, secrets, reveal };

  const onResult = (e?: unknown) => setFailure(e);
  const placement = exportPlacement(operate, action);
  const onExport = () =>
    exportExecution.mutate(undefined, { onSuccess: () => onResult(), onError: onResult });
  const env: StepCardEnv = {
    executionId: detail.id,
    ctx,
    needSecrets,
    hasSecretVariables,
    operate,
    append,
    self,
    busy: changeStatus.isPending,
    onToggleReveal: () => setReveal((r) => !r),
    onChangeStatus: (step: ExecutionStep, to: StepStatus) =>
      changeStatus.mutate(
        { stepId: step.stepId, from: step.status, to, skipReason: null },
        { onSuccess: () => onResult(), onError: onResult },
      ),
    onSkip: (step, label, title) => setDialog({ kind: "skip", step, label, title }),
    onResult,
  };

  const mainSteps = detail.steps.filter((s) => s.section === "main");
  const rollbackSteps = detail.steps.filter((s) => s.section === "rollback");
  const defs = new Map(
    [...detail.content.steps, ...detail.content.rollbackSteps].map((s) => [s.id, s]),
  );
  const nextStepId = operate ? mainSteps.find((s) => s.status === "pending")?.stepId : undefined;
  const rollbackTouched = rollbackSteps.some((s) => s.status === "done" || s.status === "failed");
  const showRollback = rollbackOpen || rollbackTouched;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "実行", to: "/executions" }, { label: detail.procedure.title }]}
      />
      <div className="mt-2 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold">{detail.procedure.title}</h1>
            <Link
              to="/procedures/$procedureId/versions/$versionNo"
              params={{ procedureId: detail.procedure.id, versionNo: String(detail.versionNo) }}
              title="この版の内容"
            >
              <Badge variant="outline" className="hover:bg-muted">
                v{detail.versionNo}
                <ExternalLink className="text-muted-foreground" aria-hidden />
              </Badge>
            </Link>
            <ExecutionStatusLabel status={detail.status} />
            {detail.approvalStatus && <ApprovalBadge status={detail.approvalStatus} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Avatar name={detail.executor.name} className="size-5 text-[10px]" />
              <span className="text-foreground">
                {detail.executor.name}
                {self && "（自分）"}
              </span>
            </span>
            <span>開始 {formatShortDateTime(detail.startedAt)}</span>
            {detail.endedAt && <span>終了 {formatShortDateTime(detail.endedAt)}</span>}
            <span>最終更新 {formatShortDateTime(detail.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {operate && (
            <Button onClick={() => setDialog({ kind: "finish" })}>
              <Flag aria-hidden />
              終了する
            </Button>
          )}
          {action === "review" && (
            <>
              <Button variant="outline" onClick={() => setDialog({ kind: "reject" })}>
                <Undo2 aria-hidden />
                差し戻す
              </Button>
              <Button onClick={() => setDialog({ kind: "approve" })}>
                <BadgeCheck aria-hidden />
                承認する
              </Button>
            </>
          )}
          {action === "resubmit" && (
            <Button onClick={() => setDialog({ kind: "resubmit" })}>
              <Send aria-hidden />
              再依頼する
            </Button>
          )}
          {placement === "button" ? (
            <Button variant="outline" disabled={exportExecution.isPending} onClick={onExport}>
              <FileSpreadsheet aria-hidden />
              Excel に出力
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label="その他の操作" />}
              >
                <Ellipsis aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem disabled={exportExecution.isPending} onClick={onExport}>
                  <FileSpreadsheet aria-hidden />
                  Excel に出力
                </DropdownMenuItem>
                {operate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog({ kind: "cancel", mode: "executor" })}
                    >
                      <Ban aria-hidden />
                      中止する
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ExecutionBanner
        detail={detail}
        failure={failure}
        owner={owner}
        promptSecrets={promptSecrets}
        onDismiss={() => setFailure(undefined)}
        onEnterSecrets={() => setDialog({ kind: "secrets" })}
        onAdminCancel={() => setDialog({ kind: "cancel", mode: "admin" })}
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_17rem]">
        <div className="grid min-w-0 gap-4">
          <section aria-labelledby="sec-main-title">
            <div className="mb-2 flex items-baseline gap-2">
              <span id="sec-main-title">
                <SectionTitle icon={ListOrdered}>手順</SectionTitle>
              </span>
              <span className="text-sm text-muted-foreground">{mainSteps.length} ステップ</span>
            </div>
            <ol className="grid gap-3">
              {mainSteps.map((s, i) => {
                const def = defs.get(s.stepId);
                return (
                  def && (
                    <StepCard
                      key={s.stepId}
                      def={def}
                      step={s}
                      index={i}
                      isNext={s.stepId === nextStepId}
                      env={env}
                    />
                  )
                );
              })}
            </ol>
          </section>
          {rollbackSteps.length > 0 && (
            <section
              id="rollback"
              className="scroll-mt-20 overflow-hidden rounded-xl border bg-card"
            >
              <button
                type="button"
                aria-expanded={showRollback}
                disabled={rollbackTouched}
                onClick={() => setRollbackOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-5 py-4 text-left transition-colors hover:bg-muted/50 disabled:hover:bg-transparent"
              >
                <Undo2 className="size-4 text-warning" aria-hidden />
                <span className="font-semibold">切り戻し手順</span>
                <span className="text-sm text-muted-foreground">
                  {rollbackSteps.length} ステップ ・{" "}
                  {rollbackTouched ? (
                    <>
                      <span className="text-warning">実施中</span>
                      （実施した実行は異常終了になります）
                    </>
                  ) : (
                    "作業全体を作業前の状態に戻すときに使います"
                  )}
                </span>
                {!rollbackTouched &&
                  (showRollback ? (
                    <ChevronUp className="ml-auto size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
                  ))}
              </button>
              {showRollback && (
                <ol className="grid gap-3 border-t bg-muted/30 p-3">
                  {rollbackSteps.map((s, i) => {
                    const def = defs.get(s.stepId);
                    return (
                      def && (
                        <StepCard
                          key={s.stepId}
                          def={def}
                          step={s}
                          index={i}
                          isNext={false}
                          env={env}
                        />
                      )
                    );
                  })}
                </ol>
              )}
            </section>
          )}
        </div>
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-4">
          <ProgressCard detail={detail} ctx={ctx} nextStepId={nextStepId} />
          <VariablesCard
            detail={detail}
            operate={operate}
            self={self}
            secrets={secrets}
            reveal={reveal}
            promptSecrets={promptSecrets}
            onToggleReveal={() => setReveal((r) => !r)}
            onEnterSecrets={() => setDialog({ kind: "secrets" })}
            onResult={onResult}
          />
          <ApprovalsCard approvals={detail.approvals} />
        </aside>
      </div>
      <ExecutionDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        env={{ detail, ctx, needSecrets, hasSecretVariables, onResult }}
      />
    </>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
  action,
}: {
  tone: "warning" | "destructive" | "success" | "muted";
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  action?: ReactNode;
}) {
  const box = {
    warning: "border-warning/40 bg-warning/10",
    destructive: "border-destructive/40 bg-destructive/10",
    success: "border-success/40 bg-success/10",
    muted: "border-border bg-muted",
  }[tone];
  const color = {
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn("mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm", box)}
    >
      <Icon className={cn("size-4 shrink-0", color)} aria-hidden />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

/** ステップの状態の競合（D-46）の文 */
function conflictMessage(detail: ExecutionDetailResponse, extra: Partial<StepStatusConflict>) {
  const step = detail.steps.find((s) => s.stepId === extra.stepId);
  const status = extra.currentStatus ? STEP_STATUS_META[extra.currentStatus]?.label : undefined;
  if (!step || !status) {
    return "ほかの画面でステップの状態が変わっていました。最新の状態を表示しています。";
  }
  const index = detail.steps.filter((s) => s.section === step.section).indexOf(step);
  return `${stepLabel(step.section, index)} の状態は、ほかの画面で「${status}」に変わっていました。最新の状態を表示しています。必要なら、もう一度変えてください。`;
}

/** 見出しの下の帯（1つだけ出す。ui.md 8.4） */
function ExecutionBanner({
  detail,
  failure,
  owner,
  promptSecrets,
  onDismiss,
  onEnterSecrets,
  onAdminCancel,
}: {
  detail: ExecutionDetailResponse;
  failure: unknown;
  owner: boolean;
  promptSecrets: boolean;
  onDismiss: () => void;
  onEnterSecrets: () => void;
  onAdminCancel: () => void;
}) {
  const dismiss = (
    <Button variant="ghost" size="icon-xs" aria-label="閉じる" onClick={onDismiss}>
      <X aria-hidden />
    </Button>
  );
  if (isApiError(failure, "STEP_STATUS_CONFLICT")) {
    return (
      <Banner tone="destructive" icon={CircleAlert} action={dismiss}>
        {conflictMessage(detail, failure.extra as Partial<StepStatusConflict>)}
      </Banner>
    );
  }
  if (failure !== undefined) {
    return (
      <div className="mt-4">
        <ErrorBanner error={failure} />
      </div>
    );
  }
  if (promptSecrets) {
    return (
      <Banner
        tone="warning"
        icon={KeyRound}
        action={
          <Button variant="outline" size="sm" onClick={onEnterSecrets}>
            <KeyRound aria-hidden />
            値を入力
          </Button>
        }
      >
        秘密変数の値を入力してください。入力するまで、秘密変数を含むコマンドのコピーとエビデンスの登録はできません（値はこのタブの中だけに置き、再読み込みすると消えます）
      </Banner>
    );
  }
  if (detail.status === "cancelled" && detail.cancelledBy) {
    return (
      <Banner tone="muted" icon={Ban}>
        <b>{detail.cancelledBy.name}</b>
        {detail.cancelledBy.id !== detail.executor.id && "（管理者）"} が{" "}
        {detail.endedAt && formatShortDateTime(detail.endedAt)} に中止しました。
        {detail.cancelReason && `理由：${detail.cancelReason}`}
      </Banner>
    );
  }
  if (detail.canAdminCancel) {
    return (
      <Banner
        tone="warning"
        icon={UserX}
        action={
          <Button variant="outline" size="sm" className="text-destructive" onClick={onAdminCancel}>
            <Ban aria-hidden />
            中止する
          </Button>
        }
      >
        実行者の <b>{detail.executor.name}</b>{" "}
        は無効化されているか、ロールが閲覧者です。この実行は管理者が中止できます。
      </Banner>
    );
  }
  if (detail.approvalStatus === "pending" && owner) {
    return (
      <Banner tone="warning" icon={Hourglass}>
        承認待ちです。承認か差し戻しが決まるまで、コメントとエビデンスは追記できません。
      </Banner>
    );
  }
  const last = detail.approvals.at(-1);
  if (detail.approvalStatus === "rejected" && last?.kind === "rejected") {
    return (
      <Banner tone="destructive" icon={Undo2}>
        <b>{last.actor.name}</b> が {formatShortDateTime(last.occurredAt)} に差し戻しました。
        {owner &&
          "コメントとエビデンスを追記してから、再依頼してください。ステップの状態は変えられません。"}
      </Banner>
    );
  }
  if (detail.approvalStatus === "approved" && last?.kind === "approved") {
    return (
      <Banner tone="success" icon={BadgeCheck}>
        <b>{last.actor.name}</b> が {formatShortDateTime(last.occurredAt)}{" "}
        に承認しました。この記録は変更できません。
      </Banner>
    );
  }
  return null;
}
