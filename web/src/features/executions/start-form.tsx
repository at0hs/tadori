import { type ProcedureDetailResponse, SECRET_MIN_LENGTH } from "@tadori/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import {
  CircleAlert,
  FileText,
  ListTodo,
  Lock,
  Play,
  RotateCw,
  ShieldOff,
  Variable,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/features/me/queries.ts";
import { SectionTitle } from "@/features/procedures/editor/sections.tsx";
import {
  DocumentSkeleton,
  PROCEDURES_CRUMB,
  ProcedureNotFound,
} from "@/features/procedures/procedure-detail.tsx";
import { MarkdownText } from "@/features/procedures/procedure-document.tsx";
import { procedureQueryOptions } from "@/features/procedures/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useStartExecution } from "./queries.ts";
import { SecretInput } from "./secret-input.tsx";
import { setSecrets } from "./secret-store.ts";

// S-10 実行の開始（ui.md 8.2）。開始できるのは最新版から（F-05）。
// 秘密変数の値はサーバーに送らず、開始した後に置き場へ入れる（D-01、D-41）。

type Version = NonNullable<ProcedureDetailResponse["latestVersion"]>;
type FormValues = { values: Record<string, string> };

export function StartExecutionPage({ procedureId }: { procedureId: string }) {
  const me = useMe();
  const isExecutor = me.roles.includes("executor");
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery({
    ...procedureQueryOptions(procedureId),
    enabled: isExecutor,
  });
  // フォームは開いたときの版に固定する。取り直しで黙って版が変わると、入力が消えるため。
  // 新しい版へは「最新版で開き直す」でだけ移る
  const [pinned, setPinned] = useState<Version>();
  if (!isExecutor) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={ShieldOff}
          title="このページを開く権限がありません"
          description="実行者ロールが必要です"
        />
      </div>
    );
  }
  if (isApiError(error, "NOT_FOUND")) return <ProcedureNotFound />;
  if (error) return <ErrorBanner error={error} />;
  if (isPending) return <DocumentSkeleton />;
  // 未公開・アーカイブからは開始できない。手順書の詳細へ戻す
  if ((data.status !== "published" && data.status !== "editing") || !data.latestVersion) {
    return <Navigate to="/procedures/$procedureId" params={{ procedureId }} replace />;
  }
  const version = pinned ?? data.latestVersion;
  if (pinned === undefined) setPinned(version);

  const reopen = async () => {
    const latest = await queryClient.fetchQuery({
      ...procedureQueryOptions(procedureId),
      staleTime: 0,
    });
    if (latest.latestVersion) setPinned(latest.latestVersion);
  };
  return (
    <StartForm
      key={version.versionNo}
      procedureId={procedureId}
      version={version}
      onReopen={reopen}
    />
  );
}

function StartForm({
  procedureId,
  version,
  onReopen,
}: {
  procedureId: string;
  version: Version;
  onReopen: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const start = useStartExecution();
  const [failure, setFailure] = useState<unknown>();
  const [newerVersionNo, setNewerVersionNo] = useState<number>();
  const { content } = version;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      values: Object.fromEntries(content.variables.map((v) => [v.name, v.default ?? ""])),
    },
  });

  const onSubmit = ({ values }: FormValues) => {
    setFailure(undefined);
    setNewerVersionNo(undefined);
    const variables: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const v of content.variables) {
      (v.secret ? secrets : variables)[v.name] = values[v.name] ?? "";
    }
    start.mutate(
      { procedureId, versionNo: version.versionNo, variables },
      {
        onSuccess: ({ id }) => {
          if (Object.keys(secrets).length > 0) setSecrets(id, secrets);
          void navigate({
            to: "/executions/$executionId",
            params: { executionId: id },
            replace: true,
          });
        },
        onError: (e) => {
          if (isApiError(e, "NOT_LATEST_VERSION")) {
            const latest = e.extra.latestVersionNo;
            setNewerVersionNo(typeof latest === "number" ? latest : version.versionNo + 1);
            return;
          }
          // サーバーの検証エラー（variables.<name>）は該当する欄に出す
          const fieldErrors = isApiError(e, "VALIDATION_FAILED")
            ? e.errors.flatMap((fe) => {
                const name = fe.path.startsWith("variables.") ? fe.path.slice(10) : null;
                return name && content.variables.some((v) => v.name === name)
                  ? [{ name, message: fe.message }]
                  : [];
              })
            : [];
          if (fieldErrors.length > 0) {
            for (const fe of fieldErrors) setError(`values.${fe.name}`, { message: fe.message });
          } else {
            setFailure(e);
          }
        },
      },
    );
  };

  const reopen = () => {
    setFailure(undefined);
    onReopen().catch((e: unknown) => setFailure(e));
  };

  return (
    <>
      <Breadcrumbs
        items={[
          PROCEDURES_CRUMB,
          { label: content.title, to: `/procedures/${procedureId}` },
          { label: "実行を開始" },
        ]}
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mx-auto mt-2 max-w-3xl">
        <h1 className="text-xl font-bold">実行を開始</h1>
        <p className="text-sm text-muted-foreground">変数の値を入れて、作業の記録を始めます</p>
        {newerVersionNo !== undefined && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span>
              この画面を開いた後に v{newerVersionNo}{" "}
              が公開されました。実行は最新版からしか始められません。
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto text-foreground"
              onClick={reopen}
            >
              <RotateCw aria-hidden />
              最新版で開き直す
            </Button>
          </div>
        )}
        {failure !== undefined && (
          <div className="mt-4">
            <ErrorBanner error={failure} />
          </div>
        )}

        <section className="mt-5 flex items-center gap-4 rounded-xl border bg-card p-5">
          <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{content.title}</div>
            <div className="text-xs text-muted-foreground">
              {version.publishedBy.name} が {formatDateTime(version.publishedAt)} に公開 ・{" "}
              {content.steps.length} ステップ、切り戻し {content.rollbackSteps.length} ステップ
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">開始する版</div>
            <div className="text-2xl font-semibold tabular-nums">v{version.versionNo}</div>
          </div>
        </section>

        <section className="mt-4 rounded-xl border bg-card p-5">
          <SectionTitle icon={Variable}>
            変数の値
            <span className="text-sm font-normal text-muted-foreground">
              {content.variables.length}
            </span>
          </SectionTitle>
          {content.variables.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">変数はありません</p>
          ) : (
            <div className="mt-1">
              {content.variables.map((v) => {
                const id = `var-${v.name}`;
                const error = errors.values?.[v.name]?.message;
                return (
                  <div
                    key={v.name}
                    className="grid grid-cols-[13rem_1fr] items-start gap-4 border-b py-4 last:border-0"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={id} className="font-mono text-[13px] font-medium">
                          #{"{"}
                          {v.name}
                          {"}"}
                        </label>
                        {v.secret && (
                          <Badge variant="outline" className="border-warning/40 text-warning">
                            <Lock aria-hidden />
                            秘密
                          </Badge>
                        )}
                      </div>
                      {v.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{v.description}</div>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      {v.secret ? (
                        <SecretInput
                          id={id}
                          aria-invalid={!!error}
                          {...register(`values.${v.name}`, {
                            required: "値を入力してください。",
                            minLength: {
                              value: SECRET_MIN_LENGTH,
                              message: `${SECRET_MIN_LENGTH} 文字以上で入力してください。`,
                            },
                          })}
                        />
                      ) : (
                        <Input
                          id={id}
                          className="font-mono"
                          autoComplete="off"
                          aria-invalid={!!error}
                          {...register(`values.${v.name}`, {
                            required: "値を入力してください。",
                            maxLength: { value: 1000, message: "値は1000文字以内にしてください。" },
                          })}
                        />
                      )}
                      {error && <p className="text-xs text-destructive">{error}</p>}
                      <p className="text-xs text-muted-foreground">
                        {v.secret ? (
                          <>
                            サーバーには送りません。このタブの中だけで使い、再読み込みやタブを閉じると消えます（再開するときに入力し直します）。
                            {SECRET_MIN_LENGTH} 文字以上
                          </>
                        ) : (
                          <>
                            {v.default !== null && (
                              <>
                                既定値 <span className="font-mono">{v.default}</span> ・{" "}
                              </>
                            )}
                            最初のステップの状態を変えるまでは、実行の画面で直せます
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {content.prerequisites && (
          <section className="mt-4 rounded-xl border bg-card p-5">
            <SectionTitle icon={ListTodo}>前提条件</SectionTitle>
            <MarkdownText text={content.prerequisites} className="mt-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              確認してから開始してください（アプリでは確かめません）
            </p>
          </section>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Link
            to="/procedures/$procedureId"
            params={{ procedureId }}
            className={buttonVariants({ variant: "ghost" })}
          >
            キャンセル
          </Link>
          <Button type="submit" disabled={start.isPending}>
            <Play aria-hidden />
            開始する
          </Button>
        </div>
      </form>
    </>
  );
}
