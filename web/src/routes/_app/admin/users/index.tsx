import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header.tsx";
import { buttonVariants } from "@/components/ui/button";
import { USER_STATUS_FILTERS } from "@/features/users/filter.ts";
import { UserList } from "@/features/users/user-list.tsx";

const DEFAULTS = { status: "active", q: "" } as const;

// S-13。絞り込みは URL の検索条件に持ち、既定の値は URL に出さない（D-12）。
export const Route = createFileRoute("/_app/admin/users/")({
  validateSearch: z.object({
    status: z.enum(USER_STATUS_FILTERS).default(DEFAULTS.status).catch(DEFAULTS.status),
    q: z.string().default(DEFAULTS.q).catch(DEFAULTS.q),
  }),
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        title="ユーザー"
        description="ユーザーとロールを管理します"
        action={
          <Link to="/admin/users/new" className={buttonVariants()}>
            <UserPlus aria-hidden />
            ユーザーを作成
          </Link>
        }
      />
      <UserList
        filter={search}
        onFilterChange={(next) =>
          navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
        }
      />
    </>
  );
}
