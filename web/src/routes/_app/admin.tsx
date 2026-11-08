import { can } from "@tadori/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { meQueryOptions } from "@/features/me/queries.ts";

// 管理者の画面（ui.md 5.3）。守りは API で行い、ここは使いやすさのための確認。
export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  if (!can(me.role, "manageUsers")) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={ShieldOff}
          title="このページを開く権限がありません"
          description="管理者のロールが必要です"
        />
      </div>
    );
  }
  return <Outlet />;
}
