import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { buttonVariants } from "@/components/ui/button";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  // S-16（screens.md）
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center bg-background">
      <EmptyState
        icon={FileQuestion}
        title="ページが見つかりません"
        description="URL が正しいか確かめてください"
        action={
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            ホームへ
          </Link>
        }
      />
    </div>
  ),
});
