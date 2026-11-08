import { can, type DraftConflict, findPublishErrors } from "@tadori/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Equal, FileCheck, Pencil, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMe } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { PublishDialog } from "../editor/editor-dialogs.tsx";
import { DocumentSkeleton, PROCEDURES_CRUMB, ProcedureNotFound } from "../procedure-detail.tsx";
import { draftQueryOptions, procedureQueryOptions, usePublish } from "../queries.ts";
import { diffProcedure } from "./compute.ts";
import { DiffRail } from "./diff-rail.tsx";
import { BasicCard, PrerequisitesCard, StepsCard, VariablesCard } from "./diff-sections.tsx";
import { summarizeDiff, summaryText } from "./summary.ts";

// S-17 下書きの変更点（F-11、D-66、ui.md 10章）。保存された下書きと最新版を比べ、承認者以上はここから公開できる。

function Header({
  procedureId,
  title,
  versionNo,
  canPublish,
  actions,
}: {
  procedureId: string;
  title: string;
  versionNo: number;
  canPublish: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <Breadcrumbs
        items={[
          PROCEDURES_CRUMB,
          { label: title, to: `/procedures/${procedureId}` },
          { label: "下書きの変更点" },
        ]}
      />
      <div className="mt-2 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">下書きの変更点</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            公開済みの v{versionNo}{" "}
            と、保存した下書きを比べています。編集画面で保存していない変更は含みません。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/procedures/$procedureId"
            params={{ procedureId }}
            className={buttonVariants({ variant: "ghost" })}
          >
            <ArrowLeft aria-hidden />
            手順書に戻る
          </Link>
          <Link
            to="/procedures/$procedureId/edit"
            params={{ procedureId }}
            className={buttonVariants({ variant: canPublish ? "outline" : "default" })}
          >
            <Pencil aria-hidden />
            編集
          </Link>
          {actions}
        </div>
      </div>
    </>
  );
}

function conflictText(c: DraftConflict): string {
  const who = c.updatedBy?.name ?? "ほかの人";
  const when = c.updatedAt ? formatShortDateTime(c.updatedAt) : "";
  switch (c.reason) {
    case "draft_saved":
      return `${who} が ${when} に下書きを保存しました。`;
    case "version_published":
      return `${who} が ${when} に新しい版を公開しました。`;
    case "draft_discarded":
      return "下書きが破棄されました。";
  }
}

/** 開いた後に下書きや版が変わっていた。古い内容は公開せず、読み込み直してもらう。 */
function PublishConflictBanner({
  conflict,
  onReload,
  reloading,
}: {
  conflict: DraftConflict;
  onReload: () => void;
  reloading: boolean;
}) {
  return (
    <div
      role="alert"
      className="mt-4 flex animate-in items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm duration-200 fade-in-0"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">公開できませんでした</p>
        <p className="mt-0.5">
          {conflictText(conflict)}読み込み直して、変更点を確かめてから公開してください。
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onReload} disabled={reloading}>
        <RotateCcw aria-hidden />
        読み込み直す
      </Button>
    </div>
  );
}

export function DraftDiffPage({ procedureId }: { procedureId: string }) {
  const me = useMe();
  const canEdit = can(me.role, "editProcedure");
  const canPublish = can(me.role, "publishProcedure");
  const detail = useQuery({ ...procedureQueryOptions(procedureId), enabled: canEdit });
  const draft = useQuery({ ...draftQueryOptions(procedureId), enabled: canEdit });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const publish = usePublish();
  const [publishOpen, setPublishOpen] = useState(false);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [reloading, setReloading] = useState(false);

  const base = detail.data?.latestVersion ?? null;
  // lock.revision が null なら下書きはない（応答の content は最新版）
  const draftData = draft.data && draft.data.lock.revision !== null ? draft.data : null;
  const diff = useMemo(
    () => (base && draftData ? diffProcedure(base.content, draftData.content) : null),
    [base, draftData],
  );
  const summary = useMemo(() => (diff ? summarizeDiff(diff) : null), [diff]);

  // 閲覧者には下書きの存在以外を見せない（S-16 と同じ）
  if (!canEdit) return <ProcedureNotFound />;
  for (const e of [detail.error, draft.error]) {
    if (isApiError(e, "NOT_FOUND") || isApiError(e, "FORBIDDEN")) return <ProcedureNotFound />;
  }
  if (detail.error) return <ErrorBanner error={detail.error} />;
  if (detail.isPending) return <DocumentSkeleton />;
  if (detail.data.status === "unpublished" || !base) {
    return <Navigate to="/procedures/$procedureId/edit" params={{ procedureId }} replace />;
  }
  // アーカイブした手順書の下書きは STATE_CONFLICT（下書きはない扱い）
  const noDraft = isApiError(draft.error, "STATE_CONFLICT") || (draft.data && !draftData);
  if (!noDraft && draft.error) return <ErrorBanner error={draft.error} />;
  if (!noDraft && (draft.isPending || !diff || !summary)) return <DocumentSkeleton />;

  /** 公開時の検証に通らない下書きは、編集画面で場所を示す。 */
  async function toEditorWithCheck() {
    await navigate({
      to: "/procedures/$procedureId/edit",
      params: { procedureId },
      state: { editorPublishCheck: true },
    });
  }

  async function onPublishClick() {
    if (!draftData) return;
    setConflict(null);
    if (findPublishErrors(draftData.content).length > 0) {
      await toEditorWithCheck();
      return;
    }
    publish.reset();
    setPublishOpen(true);
  }

  async function onPublish(changeReason: string) {
    if (!draftData) return;
    try {
      await publish.mutateAsync({
        id: procedureId,
        content: draftData.content,
        lock: draftData.lock,
        changeReason,
      });
      setPublishOpen(false);
      await navigate({ to: "/procedures/$procedureId", params: { procedureId } });
    } catch (e) {
      if (isApiError(e, "DRAFT_CONFLICT")) {
        setPublishOpen(false);
        setConflict(e.extra as DraftConflict);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (isApiError(e, "VALIDATION_FAILED") && e.errors.some((x) => x.path !== "changeReason")) {
        setPublishOpen(false);
        await toEditorWithCheck();
      }
      // ほかはダイアログの中に出す（publish.error）
    }
  }

  async function onReload() {
    setReloading(true);
    try {
      await Promise.all([
        queryClient.fetchQuery({ ...procedureQueryOptions(procedureId), staleTime: 0 }),
        queryClient.fetchQuery({ ...draftQueryOptions(procedureId), staleTime: 0 }),
      ]);
    } catch {
      // 取り直しの失敗は、それぞれの Query のエラーとして画面に出る
    } finally {
      setConflict(null);
      setReloading(false);
    }
  }

  const header = (
    <Header
      procedureId={procedureId}
      title={base.content.title}
      versionNo={base.versionNo}
      canPublish={canPublish}
      actions={
        canPublish &&
        draftData && (
          <Button type="button" onClick={onPublishClick} disabled={conflict !== null}>
            <Send aria-hidden />
            公開する
          </Button>
        )
      }
    />
  );
  const banner = conflict && (
    <PublishConflictBanner conflict={conflict} onReload={onReload} reloading={reloading} />
  );

  if (noDraft || !draftData || !diff || !summary) {
    return (
      <>
        {header}
        {banner}
        <div className="mt-6 rounded-xl border bg-card">
          <EmptyState
            icon={FileCheck}
            title="下書きはありません"
            description="公開済みの版がそのまま最新です"
            action={
              <Link
                to="/procedures/$procedureId"
                params={{ procedureId }}
                className={buttonVariants({ variant: "outline" })}
              >
                手順書に戻る
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {banner}
      {diff.changed ? (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_17rem]">
          <div className="grid min-w-0 gap-4">
            <BasicCard diff={diff} />
            <PrerequisitesCard diff={diff} />
            <VariablesCard diff={diff} />
            <StepsCard kind="steps" steps={diff.steps} baseVersionNo={base.versionNo} />
            <StepsCard
              kind="rollbackSteps"
              steps={diff.rollbackSteps}
              baseVersionNo={base.versionNo}
            />
          </div>
          <DiffRail
            diff={diff}
            summary={summary}
            base={base}
            draft={{ updatedBy: draftData.updatedBy, updatedAt: draftData.updatedAt }}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border bg-card">
          <EmptyState
            icon={Equal}
            title="変更はありません"
            description={`保存した下書きは、公開済みの v${base.versionNo} と同じ内容です。`}
          />
        </div>
      )}
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        nextVersionNo={base.versionNo + 1}
        pending={publish.isPending}
        error={publish.error}
        onPublish={onPublish}
        description="保存した下書きを公開します。公開した版は変更できません。"
        summary={{ text: summaryText(summary) }}
      />
    </>
  );
}
