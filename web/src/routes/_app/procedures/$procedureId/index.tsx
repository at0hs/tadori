import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProcedureDetail } from "@/features/procedures/procedure-detail.tsx";

// S-05。notice は編集画面から戻されたときの知らせ（アーカイブした手順書は編集できない）。
export const Route = createFileRoute("/_app/procedures/$procedureId/")({
  validateSearch: z.object({ notice: z.enum(["archived-edit"]).optional().catch(undefined) }),
  component: ProcedurePage,
});

function ProcedurePage() {
  const { procedureId } = Route.useParams();
  const { notice } = Route.useSearch();
  return <ProcedureDetail key={procedureId} procedureId={procedureId} notice={notice} />;
}
