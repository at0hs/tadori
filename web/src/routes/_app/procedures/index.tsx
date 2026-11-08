import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { FilePlus } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header.tsx";
import { buttonVariants } from "@/components/ui/button";
import { useMe } from "@/features/me/queries.ts";
import { PROCEDURE_SORTS, PROCEDURE_STATUS_FILTERS } from "@/features/procedures/filter.ts";
import { ProcedureList } from "@/features/procedures/procedure-list.tsx";
import { stringListSearchParam } from "@/lib/search.ts";

const DEFAULTS = { q: "", tag: [] as string[], status: "all", sort: "published" } as const;

// S-04。絞り込みは URL の検索条件に持ち、既定の値は URL に出さない（D-12）。
export const Route = createFileRoute("/_app/procedures/")({
  validateSearch: z.object({
    q: z.string().default(DEFAULTS.q).catch(DEFAULTS.q),
    tag: stringListSearchParam,
    status: z.enum(PROCEDURE_STATUS_FILTERS).default(DEFAULTS.status).catch(DEFAULTS.status),
    sort: z.enum(PROCEDURE_SORTS).default(DEFAULTS.sort).catch(DEFAULTS.sort),
  }),
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  component: ProceduresPage,
});

function ProceduresPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useMe();
  const canCreate = me.roles.includes("author");
  // 作成者ロールのない人には未公開の手順書が返らないので、未公開での絞り込みは「すべて」として扱う
  const status = !canCreate && search.status === "unpublished" ? "all" : search.status;
  return (
    <>
      <PageHeader
        title="手順書"
        description="作業の手順書を探して、内容の確認や実行に進みます"
        action={
          canCreate && (
            <Link to="/procedures/new" className={buttonVariants()}>
              <FilePlus aria-hidden />
              手順書を作成
            </Link>
          )
        }
      />
      <ProcedureList
        filter={{ q: search.q, tags: search.tag, status, sort: search.sort }}
        isAuthor={canCreate}
        onFilterChange={(next) =>
          navigate({
            search: (prev) => ({
              ...prev,
              ...(next.q !== undefined && { q: next.q }),
              ...(next.tags !== undefined && { tag: [...next.tags] }),
              ...(next.status !== undefined && { status: next.status }),
              ...(next.sort !== undefined && { sort: next.sort }),
            }),
            replace: true,
          })
        }
      />
    </>
  );
}
