import { createFileRoute } from "@tanstack/react-router";
import { ProcedureNotFound } from "@/features/procedures/procedure-detail.tsx";
import { VersionView } from "@/features/procedures/procedure-versions.tsx";

// S-07
export const Route = createFileRoute("/_app/procedures/$procedureId/versions/$versionNo")({
  component: VersionPage,
});

function VersionPage() {
  const { procedureId, versionNo } = Route.useParams();
  const n = Number(versionNo);
  if (!Number.isInteger(n) || n < 1) return <ProcedureNotFound />;
  return <VersionView key={`${procedureId}/${n}`} procedureId={procedureId} versionNo={n} />;
}
