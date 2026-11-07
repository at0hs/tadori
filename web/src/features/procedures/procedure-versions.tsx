import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api.ts";
import { formatDateTime } from "@/lib/format.ts";
import {
  DocumentSkeleton,
  DocumentTitle,
  OldVersionNotice,
  PROCEDURES_CRUMB,
  ProcedureNotFound,
} from "./procedure-detail.tsx";
import { ProcedureDocument, VariableList } from "./procedure-document.tsx";
import { versionQueryOptions, versionsQueryOptions } from "./queries.ts";

// S-06 版の一覧（ui.md 7.4）。新しい順。差分は出さない。
export function VersionList({ procedureId }: { procedureId: string }) {
  const { data, error, isPending } = useQuery(versionsQueryOptions(procedureId));
  if (isApiError(error, "NOT_FOUND")) return <ProcedureNotFound />;
  if (error) return <ErrorBanner error={error} />;
  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  return (
    <>
      <Breadcrumbs
        items={[
          PROCEDURES_CRUMB,
          { label: data.title, to: `/procedures/${procedureId}` },
          { label: "版の一覧" },
        ]}
      />
      <h1 className="text-xl font-bold">版の一覧</h1>
      <p className="text-sm text-muted-foreground">
        {data.title} の公開した版の履歴です。新しい順に並べています
      </p>
      <div className="mt-5 overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="w-14">版</span>
          <span className="flex-1">変更理由</span>
          <span className="w-56">公開</span>
          <span className="w-4" />
        </div>
        {data.versions.map((v, i) => (
          <Link
            key={v.versionNo}
            to="/procedures/$procedureId/versions/$versionNo"
            params={{ procedureId, versionNo: String(v.versionNo) }}
            className="flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/50"
          >
            <span className="w-14 text-xl font-semibold tabular-nums">v{v.versionNo}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium break-words">{v.changeReason}</div>
              {i === 0 && (
                <Badge variant="outline" className="mt-1">
                  最新
                </Badge>
              )}
            </div>
            <div className="w-56 text-sm">
              <div>{v.publishedBy.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDateTime(v.publishedAt)}
              </div>
            </div>
            <ChevronRight className="size-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        版同士の差分は出しません。それぞれの版を開いて内容を見てください。
      </p>
    </>
  );
}

// S-07 版の内容（ui.md 7.3）。S-05 と同じ見せ方で、操作は持たない。
export function VersionView({
  procedureId,
  versionNo,
}: {
  procedureId: string;
  versionNo: number;
}) {
  const { data, error, isPending } = useQuery(versionQueryOptions(procedureId, versionNo));
  if (isApiError(error, "NOT_FOUND")) return <ProcedureNotFound />;
  if (error) return <ErrorBanner error={error} />;
  if (isPending) return <DocumentSkeleton />;
  const latest = data.versionNo === data.latestVersionNo;
  return (
    <>
      <Breadcrumbs
        items={[
          PROCEDURES_CRUMB,
          { label: data.title, to: `/procedures/${procedureId}` },
          { label: "版の一覧", to: `/procedures/${procedureId}/versions` },
          { label: `v${data.versionNo}` },
        ]}
      />
      <div className="mt-2">
        <DocumentTitle
          title={data.content.title}
          summary={data.content.summary}
          tags={data.content.tags}
          badges={<Badge variant="outline">v{data.versionNo}</Badge>}
        />
      </div>
      {!latest && (
        <OldVersionNotice
          procedureId={procedureId}
          versionNo={data.versionNo}
          publishedAt={data.publishedAt}
          latestVersionNo={data.latestVersionNo}
        />
      )}
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <ProcedureDocument content={data.content} />
        <aside className="grid gap-4 lg:sticky lg:top-4">
          <section className="rounded-xl border bg-card p-5 text-sm" aria-label="版の情報">
            <div className="text-xs text-muted-foreground">公開</div>
            <div>
              {data.publishedBy.name} ・ {formatDateTime(data.publishedAt)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">変更理由</div>
            <div className="break-words">{data.changeReason}</div>
          </section>
          <VariableList variables={data.content.variables} />
        </aside>
      </div>
    </>
  );
}
