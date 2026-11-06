import { createFileRoute, Link } from "@tanstack/react-router";
import { House } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { PageHeader } from "@/components/page-header.tsx";
import { buttonVariants } from "@/components/ui/button";

// S-03 は F-05・F-07・F-08 を作るときに置き換える。今は案内だけ。
export const Route = createFileRoute("/_app/")({
  component: () => (
    <>
      <PageHeader title="ホーム" />
      <div className="mt-4 rounded-xl border bg-card">
        <EmptyState
          icon={House}
          title="この画面はまだありません"
          description="手順書と実行の一覧から作業を始められるようになります"
          action={
            <div className="flex gap-2">
              <Link to="/procedures" className={buttonVariants({ variant: "outline" })}>
                手順書
              </Link>
              <Link to="/executions" className={buttonVariants({ variant: "outline" })}>
                実行
              </Link>
            </div>
          }
        />
      </div>
    </>
  ),
});
