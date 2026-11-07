import { APPROVAL_STATUSES, EXECUTION_STATUSES, type ExecutionStatus } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/page-header.tsx";
import { ExecutionList, procedureTitleOf } from "@/features/executions/execution-list.tsx";
import { EXECUTION_LIST_FILTERS, EXECUTION_SORTS } from "@/features/executions/filter.ts";
import { executionListQueryOptions } from "@/features/executions/queries.ts";
import { PROCEDURES_CRUMB } from "@/features/procedures/procedure-detail.tsx";

const DEFAULTS = { card: "all", status: [] as ExecutionStatus[], sort: "updated" } as const;

// S-11。絞り込みは URL の検索条件に持ち、既定の値は URL に出さない（D-12）。
// procedure は手順書の詳細（S-05）の「この手順書の実行」から来たとき。
export const Route = createFileRoute("/_app/executions/")({
  validateSearch: z.object({
    card: z.enum(EXECUTION_LIST_FILTERS).default(DEFAULTS.card).catch(DEFAULTS.card),
    status: z.array(z.enum(EXECUTION_STATUSES)).default([]).catch([]),
    approval: z.enum(APPROVAL_STATUSES).optional().catch(undefined),
    procedure: z.string().optional().catch(undefined),
    executor: z.string().optional().catch(undefined),
    sort: z.enum(EXECUTION_SORTS).default(DEFAULTS.sort).catch(DEFAULTS.sort),
  }),
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  component: ExecutionsPage,
});

function ExecutionsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: list } = useQuery(executionListQueryOptions);
  const procedureTitle = search.procedure && procedureTitleOf(list, search.procedure);
  return (
    <>
      <PageHeader
        title={search.procedure ? "この手順書の実行" : "実行"}
        description="実行の進み具合と承認の状態を見ます"
        breadcrumbs={
          search.procedure
            ? [
                PROCEDURES_CRUMB,
                {
                  label: procedureTitle ?? "手順書",
                  to: `/procedures/${search.procedure}`,
                },
                { label: "この手順書の実行" },
              ]
            : undefined
        }
      />
      <ExecutionList
        filter={search}
        onFilterChange={({ status, ...rest }) =>
          navigate({
            search: (prev) => ({
              ...prev,
              ...rest,
              ...(status !== undefined && { status: [...status] }),
            }),
            replace: true,
          })
        }
      />
    </>
  );
}
