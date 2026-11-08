import type { ProcedureDetailResponse } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import {
  Archive,
  CircleAlert,
  Ellipsis,
  FileX,
  History,
  ListChecks,
  Pencil,
  Play,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { formatDateTime, formatShortDateTime } from "@/lib/format.ts";
import { ArchiveDialog } from "./archive-dialog.tsx";
import { ProcedureDocument, VariableList } from "./procedure-document.tsx";
import { ProcedureStatusLabel } from "./procedure-status.tsx";
import { procedureQueryOptions } from "./queries.ts";

/** 編集画面・実行の開始の画面から S-05 へ戻したときの知らせ（?notice=…）。 */
export const PROCEDURE_NOTICES = ["archived-edit", "archived-start"] as const;
export type ProcedureNotice = (typeof PROCEDURE_NOTICES)[number];
const NOTICE_MESSAGES: Record<ProcedureNotice, string> = {
  "archived-edit": "アーカイブした手順書は編集できません。",
  "archived-start": "この手順書はアーカイブされたため、実行を始められません。",
};

export const PROCEDURES_CRUMB = { label: "手順書", to: "/procedures" };

/** 手順書が見つからない（S-16 と同じ出し方）。 */
export function ProcedureNotFound() {
  return (
    <div className="rounded-xl border bg-card">
      <EmptyState icon={FileX} title="手順書が見つかりません" />
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-4 w-96" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}

/** 見出しの部分の、タイトル・概要・タグ。 */
export function DocumentTitle({
  title,
  summary,
  tags,
  badges,
}: {
  title: string;
  summary: string;
  tags: string[];
  badges: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{title}</h1>
        {badges}
      </div>
      {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="outline">
              <Tag className="text-muted-foreground" aria-hidden />
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "muted"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "warning"
          ? "mt-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
          : "mt-4 flex items-center gap-2 rounded-lg border bg-muted px-4 py-2.5 text-sm"
      }
    >
      {children}
    </div>
  );
}

// S-05 の中身（ui.md 7.3、配置は案2：本文を左、版の情報と変数を右）。
export function ProcedureDetail({
  procedureId,
  notice,
}: {
  procedureId: string;
  notice?: ProcedureNotice;
}) {
  const me = useMe();
  const { data, error, isPending } = useQuery(procedureQueryOptions(procedureId));
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (isApiError(error, "NOT_FOUND")) return <ProcedureNotFound />;
  if (error) return <ErrorBanner error={error} />;
  if (isPending) return <DocumentSkeleton />;
  // 未公開の手順書は作成者だけが開ける。編集画面へ移す（screens.md S-05）
  if (data.status === "unpublished" || !data.latestVersion) {
    return <Navigate to="/procedures/$procedureId/edit" params={{ procedureId }} replace />;
  }

  const version = data.latestVersion;
  const isAuthor = me.roles.includes("author");
  const isExecutor = me.roles.includes("executor");
  const archived = data.status === "archived";

  return (
    <>
      <Breadcrumbs items={[PROCEDURES_CRUMB, { label: version.content.title }]} />
      <div className="mt-2 flex items-start gap-4">
        <DocumentTitle
          title={version.content.title}
          summary={version.content.summary}
          tags={version.content.tags}
          badges={
            <>
              <Badge variant="outline">v{version.versionNo}</Badge>
              <ProcedureStatusLabel status={data.status} />
            </>
          }
        />
        <div className="flex items-center gap-2">
          {isExecutor && !archived && (
            <Link
              to="/procedures/$procedureId/start"
              params={{ procedureId }}
              className={buttonVariants()}
            >
              <Play aria-hidden />
              実行を開始
            </Link>
          )}
          {isAuthor && !archived && (
            <Link
              to="/procedures/$procedureId/edit"
              params={{ procedureId }}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden />
              編集
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="その他の操作" />}
            >
              <Ellipsis aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                render={<Link to="/procedures/$procedureId/versions" params={{ procedureId }} />}
              >
                <History aria-hidden />
                版の一覧
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link to="/executions" search={{ procedure: procedureId }} />}
              >
                <ListChecks aria-hidden />
                この手順書の実行
              </DropdownMenuItem>
              {isAuthor && !archived && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
                    <Archive aria-hidden />
                    アーカイブ
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {notice && (
        <div className="mt-4">
          <ErrorBanner message={NOTICE_MESSAGES[notice]} />
        </div>
      )}
      {archived && (
        <Notice tone="muted">
          <Archive className="size-4 text-muted-foreground" aria-hidden />
          アーカイブした手順書です。新しい実行は始められません。
        </Notice>
      )}
      {data.status === "editing" && <EditingNotice draft={data.draft} />}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <ProcedureDocument content={version.content} />
        <aside className="grid gap-4 lg:sticky lg:top-4">
          <VersionInfo procedureId={procedureId} version={version} />
          <VariableList variables={version.content.variables} />
        </aside>
      </div>

      <ArchiveDialog
        procedureId={procedureId}
        title={version.content.title}
        draft={data.draft}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </>
  );
}

/** 編集中の帯。下書きの保存者と日時は作成者にだけ届く（API が返さない、D-49）。 */
function EditingNotice({ draft }: { draft: ProcedureDetailResponse["draft"] }) {
  return (
    <Notice tone="warning">
      <Pencil className="size-4 shrink-0 text-warning" aria-hidden />
      {draft ? (
        <span>
          編集中です。下書きは <b>{draft.updatedBy.name}</b> が{" "}
          {formatShortDateTime(draft.updatedAt)}{" "}
          に保存しました。この画面には公開済みの版を出しています。
        </span>
      ) : (
        <span>編集中です。この画面には公開済みの版を出しています。</span>
      )}
    </Notice>
  );
}

function VersionInfo({
  procedureId,
  version,
}: {
  procedureId: string;
  version: NonNullable<ProcedureDetailResponse["latestVersion"]>;
}) {
  return (
    <section className="rounded-xl border bg-card p-5" aria-label="版の情報">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">版</span>
        <span className="text-3xl font-semibold tabular-nums">v{version.versionNo}</span>
        <Badge variant="outline" className="ml-auto">
          最新
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">公開</dt>
          <dd>
            {version.publishedBy.name} ・ {formatDateTime(version.publishedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">変更理由</dt>
          <dd className="break-words">{version.changeReason}</dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-1 border-t pt-3 text-sm">
        <Link
          to="/procedures/$procedureId/versions"
          params={{ procedureId }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <History className="size-4" aria-hidden />
          版の一覧
          <span className="ml-auto text-xs tabular-nums">{version.versionNo}</span>
        </Link>
        <Link
          to="/executions"
          search={{ procedure: procedureId }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ListChecks className="size-4" aria-hidden />
          この手順書の実行
        </Link>
      </div>
    </section>
  );
}

export function OldVersionNotice({
  procedureId,
  versionNo,
  publishedAt,
  latestVersionNo,
}: {
  procedureId: string;
  versionNo: number;
  publishedAt: string;
  latestVersionNo: number;
}) {
  return (
    <Notice tone="warning">
      <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
      これは v{versionNo}（{formatDateTime(publishedAt).slice(0, 10)} 公開）の内容です。最新版は v
      {latestVersionNo} です。
      <Link
        to="/procedures/$procedureId"
        params={{ procedureId }}
        className={buttonVariants({ variant: "outline", size: "sm", className: "ml-auto" })}
      >
        最新版を見る
      </Link>
    </Notice>
  );
}
