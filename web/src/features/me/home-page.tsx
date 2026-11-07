import type { HomeDraft, HomeExecution, MeHomeResponse, Role } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Coffee,
  FilePenLine,
  Flag,
  Hourglass,
  House,
  ListChecks,
  type LucideIcon,
  PencilLine,
  Play,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { PageHeader } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/features/executions/execution-list.tsx";
import {
  ApprovalBadge,
  Avatar,
  ExecutionStatusLabel,
} from "@/features/executions/execution-status.tsx";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { type HomeSectionKey, homeSections, visibleItems } from "./home.ts";
import { homeQueryOptions, useMe } from "./queries.ts";

// S-03（ui.md 9章）。ロールに応じた区画を縦に積む（案1）。

type SectionMeta = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  empty: string;
  emptyIcon: LucideIcon;
  role: Role;
};

const SECTIONS: Record<HomeSectionKey, SectionMeta> = {
  myExecutions: {
    title: "自分の実行",
    description: "実行中か差し戻しの、自分の実行",
    icon: Play,
    tone: "text-primary",
    empty: "続きの作業はありません",
    emptyIcon: Coffee,
    role: "executor",
  },
  pendingApprovals: {
    title: "承認待ち",
    description: "あなたの承認を待っている実行",
    icon: Hourglass,
    tone: "text-warning",
    empty: "承認待ちの実行はありません",
    emptyIcon: BadgeCheck,
    role: "approver",
  },
  drafts: {
    title: "編集中の手順書",
    description: "下書きのある手順書（未公開を含む）",
    icon: PencilLine,
    tone: "text-warning",
    empty: "編集中の手順書はありません",
    emptyIcon: BookOpen,
    role: "author",
  },
};

const ORDER: HomeSectionKey[] = ["myExecutions", "pendingApprovals", "drafts"];

export function HomePage() {
  const me = useMe();
  const { data, error, isPending } = useQuery(homeQueryOptions);

  // 「すべて見る」の行き先（ui.md 9.2）
  const allLinks: Record<HomeSectionKey, LinkProps> = {
    myExecutions: { to: "/executions", search: { executor: me.id } },
    pendingApprovals: { to: "/executions", search: { approval: "pending" } },
    drafts: { to: "/procedures", search: { status: "editing" } },
  };

  // 読み込み中は、ロールから区画の数を決めて骨組みを出す
  const keys = data ? homeSections(data) : ORDER.filter((k) => me.roles.includes(SECTIONS[k].role));

  return (
    <>
      <PageHeader title="ホーム" description="続きの作業と、承認を待っている実行です" />
      {error ? (
        <div className="mt-5">
          <ErrorBanner error={error} />
        </div>
      ) : keys.length === 0 && !isPending ? (
        <div className="mt-5 rounded-xl border bg-card">
          <EmptyState
            icon={House}
            title="手順書と実行は、それぞれの一覧から見られます"
            description="手順書を読んだり、実行の記録や承認の状態を確かめたりできます"
            action={
              <div className="flex gap-2">
                <Link to="/procedures" className={buttonVariants({ variant: "outline" })}>
                  <BookOpen aria-hidden />
                  手順書の一覧
                </Link>
                <Link to="/executions" className={buttonVariants({ variant: "outline" })}>
                  <ListChecks aria-hidden />
                  実行の一覧
                </Link>
              </div>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          {keys.map((k) =>
            data ? (
              <Section key={k} meta={SECTIONS[k]} link={allLinks[k]} items={rowsOf(data, k)} />
            ) : (
              <SectionSkeleton key={k} />
            ),
          )}
        </div>
      )}
    </>
  );
}

function rowsOf(data: MeHomeResponse, key: HomeSectionKey): ReactNode[] {
  switch (key) {
    case "myExecutions":
      return (data.myExecutions ?? []).map((e) => <MyExecutionRow key={e.id} execution={e} />);
    case "pendingApprovals":
      return (data.pendingApprovals ?? []).map((e) => (
        <PendingApprovalRow key={e.id} execution={e} />
      ));
    case "drafts":
      return (data.drafts ?? []).map((d) => <DraftRow key={d.id} draft={d} />);
  }
}

function Section({
  meta,
  link,
  items,
}: {
  meta: SectionMeta;
  link: LinkProps;
  items: ReactNode[];
}) {
  const { shown, rest } = visibleItems(items);
  const Icon = meta.icon;
  const EmptyIcon = meta.emptyIcon;
  return (
    <section aria-label={meta.title} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className={cn("size-4", meta.tone)} aria-hidden />
        <h2 className="font-semibold">{meta.title}</h2>
        <Badge variant="outline" className="tabular-nums">
          {items.length}
        </Badge>
        <span className="hidden text-xs text-muted-foreground sm:inline">{meta.description}</span>
        <Link
          {...link}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          すべて見る
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
          <EmptyIcon className="size-5" aria-hidden />
          {meta.empty}
        </div>
      ) : (
        <>
          {shown}
          {rest > 0 && (
            <Link
              {...link}
              className="flex items-center justify-center gap-1 border-t px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              ほか {rest} 件をすべて見る
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Skeleton className="h-4 w-28" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

const ROW =
  "flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/50";

function RowIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span
      className={cn("grid size-9 shrink-0 place-items-center rounded-lg", className)}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
}

function Title({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>
    </div>
  );
}

function Time({ iso }: { iso: string }) {
  return (
    <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
      {formatShortDateTime(iso)}
    </span>
  );
}

function Person({ name }: { name: string }) {
  return (
    <span className="flex w-32 shrink-0 items-center gap-1.5 text-sm">
      <Avatar name={name} />
      <span className="truncate">{name}</span>
    </span>
  );
}

const Chevron = () => <ChevronRight className="size-4 w-4 text-muted-foreground" aria-hidden />;

function MyExecutionRow({ execution: e }: { execution: HomeExecution }) {
  const rejected = e.approvalStatus === "rejected";
  return (
    <Link to="/executions/$executionId" params={{ executionId: e.id }} className={ROW}>
      <RowIcon
        icon={rejected ? Undo2 : Play}
        className={
          rejected ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"
        }
      />
      <Title title={e.procedure.title} sub={`v${e.versionNo}`} />
      <span className="flex w-24 shrink-0">
        {rejected ? (
          <ApprovalBadge status="rejected" />
        ) : (
          <ExecutionStatusLabel status={e.status} />
        )}
      </span>
      <span className="flex w-36 shrink-0">
        <ProgressBar execution={e} />
      </span>
      <Time iso={e.updatedAt} />
      <Chevron />
    </Link>
  );
}

function PendingApprovalRow({ execution: e }: { execution: HomeExecution }) {
  return (
    <Link to="/executions/$executionId" params={{ executionId: e.id }} className={ROW}>
      <RowIcon icon={Flag} className="bg-warning/10 text-warning" />
      <Title title={e.procedure.title} sub={`v${e.versionNo}`} />
      <Person name={e.executor.name} />
      <span className="flex w-20 shrink-0">
        <ExecutionStatusLabel status={e.status} />
      </span>
      {e.endedAt ? <Time iso={e.endedAt} /> : <span className="w-24 shrink-0" />}
      <Chevron />
    </Link>
  );
}

function DraftRow({ draft: d }: { draft: HomeDraft }) {
  const published = d.status === "editing";
  return (
    <Link to="/procedures/$procedureId/edit" params={{ procedureId: d.id }} className={ROW}>
      <RowIcon
        icon={FilePenLine}
        className={
          published ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        }
      />
      <Title title={d.title} sub={published ? "公開済みの手順書の下書き" : "まだ公開していない"} />
      <span className="flex w-20 shrink-0">
        {published ? (
          <Badge variant="outline" className="border-warning/40 text-warning">
            編集中
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            未公開
          </Badge>
        )}
      </span>
      <Person name={d.updatedBy.name} />
      <Time iso={d.updatedAt} />
      <Chevron />
    </Link>
  );
}
