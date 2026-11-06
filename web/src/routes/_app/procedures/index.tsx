import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { PageHeader } from "@/components/page-header.tsx";

// F-02 を作るときに置き換える。
export const Route = createFileRoute("/_app/procedures/")({
  component: () => (
    <>
      <PageHeader title="手順書" />
      <div className="mt-4 rounded-xl border bg-card">
        <EmptyState icon={BookOpen} title="この画面はまだありません" />
      </div>
    </>
  ),
});
