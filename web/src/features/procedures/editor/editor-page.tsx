import { useQuery } from "@tanstack/react-query";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { useMe } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { DocumentSkeleton, ProcedureNotFound } from "../procedure-detail.tsx";
import { draftQueryOptions } from "../queries.ts";
import { ProcedureEditor } from "./procedure-editor.tsx";

// S-08・S-09 の入口。作成者ロールの確認（守りは API）と、編集画面に読み込む内容の取得。

function NoPermission() {
  return (
    <div className="rounded-xl border bg-card">
      <EmptyState
        icon={ShieldOff}
        title="このページを開く権限がありません"
        description="作成者ロールが必要です"
      />
    </div>
  );
}

export function NewProcedurePage() {
  const me = useMe();
  if (!me.roles.includes("author")) return <NoPermission />;
  return <ProcedureEditor mode="new" initial={null} />;
}

export function EditProcedurePage({ procedureId }: { procedureId: string }) {
  const me = useMe();
  const isAuthor = me.roles.includes("author");
  const fromHistory = useRouterState({ select: (s) => s.location.state.editorNotice });
  // 知らせは1回だけ出す。開いたときの値を取っておき、再読み込みでまた出ないようブラウザの履歴の状態からは消す
  // （消すとルーターの状態からも消えることがあるので、表示には取っておいた値を使う）
  const [notice] = useState(fromHistory);
  useEffect(() => {
    if (!notice) return;
    const { editorNotice: _, ...rest } = window.history.state ?? {};
    window.history.replaceState(rest, "");
  }, [notice]);
  const { data, error, isPending } = useQuery({
    ...draftQueryOptions(procedureId),
    enabled: isAuthor,
  });
  if (!isAuthor || isApiError(error, "FORBIDDEN")) return <NoPermission />;
  if (isApiError(error, "NOT_FOUND")) return <ProcedureNotFound />;
  // アーカイブした手順書は編集できない。詳細に戻して伝える（screens.md S-09）
  if (isApiError(error, "STATE_CONFLICT")) {
    return (
      <Navigate
        to="/procedures/$procedureId"
        params={{ procedureId }}
        search={{ notice: "archived-edit" }}
        replace
      />
    );
  }
  if (error) return <ErrorBanner error={error} />;
  if (isPending) return <DocumentSkeleton />;
  return <ProcedureEditor mode="edit" procedureId={procedureId} initial={data} notice={notice} />;
}
