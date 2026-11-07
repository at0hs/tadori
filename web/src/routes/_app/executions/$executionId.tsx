import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";

// S-12。Task 9 で実行の画面に置き換える。
export const Route = createFileRoute("/_app/executions/$executionId")({
  component: () => (
    <div className="rounded-xl border bg-card">
      <EmptyState icon={ListChecks} title="この画面はまだありません" />
    </div>
  ),
});
