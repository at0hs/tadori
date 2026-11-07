import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state.tsx";
import { PageHeader } from "@/components/page-header.tsx";

// F-07 を作るときに置き換える。手順書の詳細からの「この手順書の実行」（procedure）だけ先に受ける。
export const Route = createFileRoute("/_app/executions/")({
  validateSearch: z.object({ procedure: z.string().optional().catch(undefined) }),
  component: () => (
    <>
      <PageHeader title="実行" />
      <div className="mt-4 rounded-xl border bg-card">
        <EmptyState icon={ListChecks} title="この画面はまだありません" />
      </div>
    </>
  ),
});
