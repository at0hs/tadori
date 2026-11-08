import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PROCEDURE_NOTICES, ProcedureDetail } from "@/features/procedures/procedure-detail.tsx";

// S-05。notice は編集画面・実行の開始の画面から戻されたときの知らせ（アーカイブした手順書は編集も実行の開始もできない）。
export const Route = createFileRoute("/_app/procedures/$procedureId/")({
  validateSearch: z.object({ notice: z.enum(PROCEDURE_NOTICES).optional().catch(undefined) }),
  component: ProcedurePage,
});

function ProcedurePage() {
  const { procedureId } = Route.useParams();
  const { notice } = Route.useSearch();
  return <ProcedureDetail key={procedureId} procedureId={procedureId} notice={notice} />;
}
