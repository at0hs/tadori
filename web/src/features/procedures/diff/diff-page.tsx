import { can } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Equal, FileCheck, Pencil } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { buttonVariants } from "@/components/ui/button";
import { useMe } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { DocumentSkeleton, PROCEDURES_CRUMB, ProcedureNotFound } from "../procedure-detail.tsx";
import { draftQueryOptions, procedureQueryOptions } from "../queries.ts";
import { diffProcedure } from "./compute.ts";
import { DiffRail } from "./diff-rail.tsx";
import { BasicCard, PrerequisitesCard, StepsCard, VariablesCard } from "./diff-sections.tsx";
import { summarizeDiff } from "./summary.ts";

// S-17 下書きの変更点（F-11、D-66、ui.md 10章）。保存された下書きと最新版を比べる。

function Header({
  procedureId,
  title,
  versionNo,
  canPublish,
  actions,
}: {
  procedureId: string;
  title: string;
  versionNo: number | null;
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
          {versionNo !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              公開済みの v{versionNo}{" "}
              と、保存した下書きを比べています。編集画面で保存していない変更は含みません。
            </p>
          )}
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

export function DraftDiffPage({ procedureId }: { procedureId: string }) {
  const me = useMe();
  const canEdit = can(me.role, "editProcedure");
  const canPublish = can(me.role, "publishProcedure");
  const detail = useQuery({ ...procedureQueryOptions(procedureId), enabled: canEdit });
  const draft = useQuery({ ...draftQueryOptions(procedureId), enabled: canEdit });

  const base = detail.data?.latestVersion ?? null;
  const draftContent = draft.data?.lock.revision != null ? draft.data.content : null;
  const diff = useMemo(
    () => (base && draftContent ? diffProcedure(base.content, draftContent) : null),
    [base, draftContent],
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

  const header = (
    <Header
      procedureId={procedureId}
      title={base.content.title}
      versionNo={base.versionNo}
      canPublish={canPublish}
    />
  );
  const noDraft =
    isApiError(draft.error, "STATE_CONFLICT") || (draft.data && draft.data.lock.revision === null);
  if (noDraft) {
    return (
      <>
        {header}
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
  if (draft.error) return <ErrorBanner error={draft.error} />;
  if (draft.isPending || !diff || !summary || !draft.data) return <DocumentSkeleton />;

  if (!diff.changed) {
    return (
      <>
        {header}
        <div className="mt-6 rounded-xl border bg-card">
          <EmptyState
            icon={Equal}
            title="変更はありません"
            description={`保存した下書きは、公開済みの v${base.versionNo} と同じ内容です。`}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
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
          draft={{ updatedBy: draft.data.updatedBy, updatedAt: draft.data.updatedAt }}
        />
      </div>
    </>
  );
}
