import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { PageHeader } from "@/components/page-header.tsx";

// F-07 を作るときに置き換える。
export const Route = createFileRoute("/_app/executions/")({
  component: () => (
    <>
      <PageHeader title="実行" />
      <div className="mt-4 rounded-xl border bg-card">
        <EmptyState icon={ListChecks} title="この画面はまだありません" />
      </div>
    </>
  ),
});
