import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DraftConflict,
  type DraftLock,
  type DraftResponse,
  findPublishErrors,
  type ProcedureContent,
  procedureContentSchema,
  type UserRef,
} from "@tadori/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Ellipsis, ListOrdered, Save, Send, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type FieldPath, FormProvider, useForm, useWatch } from "react-hook-form";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type FieldError, isApiError } from "@/lib/api.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { PROCEDURES_CRUMB } from "../procedure-detail.tsx";
import {
  draftQueryOptions,
  procedureListQueryOptions,
  useCreateProcedure,
  useDiscardDraft,
  usePublish,
  useSaveDraft,
} from "../queries.ts";
import { ConflictBanner, ErrorListBanner, SessionBanner } from "./conflict-banner.tsx";
import { DiscardDialog, PublishDialog, UnsavedDialog } from "./editor-dialogs.tsx";
import { type ErrorRow, emptyContent, errorSummary, toFormPath } from "./form.ts";
import { BasicSection, PrerequisitesSection, SectionTitle, VariablesSection } from "./sections.tsx";
import { StepList } from "./step-list.tsx";

// S-08・S-09 の本体（screens.md、ui.md 7.5）。文書を丸ごとフォームで持ち、まとめて保存する。

type Meta = {
  status: DraftResponse["status"] | "new";
  baseVersionNo: number | null;
  updatedBy: UserRef | null;
  updatedAt: string | null;
};

type Banner =
  | { kind: "errors"; title: string; rows: ErrorRow[] }
  | { kind: "conflict"; conflict: DraftConflict }
  | { kind: "session" }
  | { kind: "error"; error: unknown };

/** エラーの場所の要素へスクロールする。 */
function jumpTo(path: string) {
  const [head, index] = path.split(".");
  const id =
    (head === "steps" || head === "rollbackSteps") && index !== undefined
      ? `${head}-${index}`
      : head === "steps"
        ? "sec-steps"
        : head === "rollbackSteps"
          ? "sec-rb"
          : head === "variables"
            ? "sec-var"
            : head === "prerequisites"
              ? "sec-pre"
              : "sec-basic";
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (head === "title" || head === "summary") document.getElementById(head)?.focus();
}

export function ProcedureEditor({
  mode,
  procedureId,
  initial,
  notice,
}: {
  mode: "new" | "edit";
  procedureId?: string;
  initial: DraftResponse | null;
  notice?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = procedureId ?? "";
  const form = useForm<ProcedureContent>({
    resolver: zodResolver(procedureContentSchema),
    defaultValues: initial?.content ?? emptyContent(),
  });
  const { isDirty, isSubmitting } = form.formState;
  const variables = useWatch({ control: form.control, name: "variables" });
  const { data: list } = useQuery(procedureListQueryOptions);
  const tagSuggestions = [...new Set((list ?? []).flatMap((p) => p.tags))];

  const [lock, setLock] = useState<DraftLock | null>(initial?.lock ?? null);
  const [meta, setMeta] = useState<Meta>({
    status: initial?.status ?? "new",
    baseVersionNo: initial?.baseVersionNo ?? null,
    updatedBy: initial?.updatedBy ?? null,
    updatedAt: initial?.updatedAt ?? null,
  });
  const [banner, setBanner] = useState<Banner | null>(
    notice ? { kind: "error", error: new Error(notice) } : null,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  const create = useCreateProcedure();
  const save = useSaveDraft(id);
  const publish = usePublish();
  const discard = useDiscardDraft(id);

  // 成功した後の移動は止めない
  const leaving = useRef(false);
  const dirty = useRef(isDirty);
  dirty.current = isDirty;
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current && !leaving.current,
    enableBeforeUnload: () => dirty.current && !leaving.current,
    withResolver: true,
  });

  const locked = banner?.kind === "conflict";
  const busy = isSubmitting || create.isPending || save.isPending || publish.isPending;

  // S-08 の公開に失敗して移ってきたときは、上の帯を見せる
  useEffect(() => {
    if (notice) window.scrollTo({ top: 0 });
  }, [notice]);

  function showErrors(title: string, errors: FieldError[], content: ProcedureContent) {
    for (const e of errors) {
      if (e.path === "changeReason") continue;
      form.setError(toFormPath(e.path) as FieldPath<ProcedureContent>, { message: e.message });
    }
    const rows = errorSummary(
      errors
        .filter((e) => e.path !== "changeReason")
        .map((e) => ({ ...e, path: toFormPath(e.path) })),
      content,
    );
    setBanner({ kind: "errors", title, rows });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** API のエラーを画面に出す。扱ったら true。 */
  function handleError(e: unknown, content: ProcedureContent, action: "保存" | "公開"): boolean {
    if (isApiError(e, "VALIDATION_FAILED") && e.errors.some((x) => x.path !== "changeReason")) {
      showErrors(`${action}できませんでした。次の場所を直してください`, e.errors, content);
      return true;
    }
    if (isApiError(e, "DRAFT_CONFLICT")) {
      setBanner({ kind: "conflict", conflict: e.extra as DraftConflict });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    if (isApiError(e, "UNAUTHENTICATED")) {
      setBanner({ kind: "session" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    if (isApiError(e, "VALIDATION_FAILED")) return false; // 変更理由だけのエラーはダイアログに出す
    setBanner({ kind: "error", error: e });
    return true;
  }

  const onSave = form.handleSubmit(
    async (content) => {
      setBanner(null);
      try {
        if (mode === "new") {
          const created = await create.mutateAsync(content);
          leaving.current = true;
          form.reset(content);
          // 最初の保存で手順書ができるので、URL を S-09 に置き換える（screens.md 7章）
          await navigate({
            to: "/procedures/$procedureId/edit",
            params: { procedureId: created.id },
            replace: true,
          });
          return;
        }
        if (!lock) return;
        const saved = await save.mutateAsync({ content, lock });
        setLock({ revision: saved.revision });
        setMeta((m) => ({
          ...m,
          status: m.status === "published" ? "editing" : m.status,
          updatedBy: saved.updatedBy,
          updatedAt: saved.updatedAt,
        }));
        form.reset(content);
      } catch (e) {
        handleError(e, content, "保存");
      }
    },
    () => window.scrollTo({ top: 0, behavior: "smooth" }),
  );

  // 公開：送る前に公開時の検証を当て、通ればダイアログを開く
  const onPublishClick = form.handleSubmit((content) => {
    setBanner(null);
    const errors = findPublishErrors(content);
    if (errors.length > 0) {
      showErrors("公開できませんでした。次の場所を直してください", errors, content);
      return;
    }
    publish.reset();
    create.reset();
    setPublishOpen(true);
  });

  async function onPublish(changeReason: string) {
    const content = form.getValues();
    try {
      if (mode === "new") {
        // 作成してから公開する。作成と公開をまとめた API は作らない（api.md 4.3）
        const created = await create.mutateAsync(content);
        try {
          await publishTo(created.id, { revision: created.revision }, content, changeReason);
        } catch (e) {
          leaving.current = true;
          form.reset(content);
          await navigate({
            to: "/procedures/$procedureId/edit",
            params: { procedureId: created.id },
            replace: true,
            state: {
              editorNotice: isApiError(e)
                ? `下書きは保存しましたが、公開できませんでした。${e.message}`
                : "下書きは保存しましたが、公開できませんでした。",
            },
          });
        }
        return;
      }
      if (!lock) return;
      await publishTo(id, lock, content, changeReason);
    } catch (e) {
      if (handleError(e, content, "公開")) setPublishOpen(false);
    }
  }

  async function publishTo(
    targetId: string,
    targetLock: DraftLock,
    content: ProcedureContent,
    changeReason: string,
  ) {
    await publish.mutateAsync({ id: targetId, content, lock: targetLock, changeReason });
    leaving.current = true;
    setPublishOpen(false);
    await navigate({ to: "/procedures/$procedureId", params: { procedureId: targetId } });
  }

  async function onDiscard() {
    if (!lock || lock.revision === null) return;
    try {
      const r = await discard.mutateAsync(lock.revision);
      leaving.current = true;
      setDiscardOpen(false);
      if (r.deleted === "procedure") await navigate({ to: "/procedures" });
      else await navigate({ to: "/procedures/$procedureId", params: { procedureId: id } });
    } catch (e) {
      if (isApiError(e, "DRAFT_CONFLICT") || isApiError(e, "UNAUTHENTICATED")) {
        setDiscardOpen(false);
        handleError(e, form.getValues(), "保存");
      }
    }
  }

  async function onReload() {
    setReloading(true);
    try {
      const fresh = await queryClient.fetchQuery({ ...draftQueryOptions(id), staleTime: 0 });
      form.reset(fresh.content);
      setLock(fresh.lock);
      setMeta({
        status: fresh.status,
        baseVersionNo: fresh.baseVersionNo,
        updatedBy: fresh.updatedBy,
        updatedAt: fresh.updatedAt,
      });
      setBanner(null);
    } catch (e) {
      setBanner({ kind: "error", error: e });
    } finally {
      setReloading(false);
    }
  }

  const title = mode === "new" ? "手順書を作成" : "手順書を編集";
  const nextVersionNo = (meta.baseVersionNo ?? 0) + 1;
  const canDiscard = mode === "edit" && lock !== null && lock.revision !== null;
  const cancelTo =
    mode === "new" || meta.status === "unpublished"
      ? { to: "/procedures" as const }
      : { to: "/procedures/$procedureId" as const, params: { procedureId: id } };

  return (
    <FormProvider {...form}>
      <form onSubmit={onSave} noValidate>
        <div className="sticky top-0 z-20 -mx-6 border-b bg-background/90 px-6 pt-1 pb-3 backdrop-blur">
          <Breadcrumbs
            items={[
              PROCEDURES_CRUMB,
              ...(mode === "new"
                ? [{ label: "新規作成" }]
                : [{ label: initial?.content.title || "（タイトルなし）" }, { label: "編集" }]),
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold">{title}</h1>
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 text-xs text-warning">
                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                保存していない変更があります
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Link {...cancelTo} className={buttonVariants({ variant: "ghost" })}>
                編集をやめる
              </Link>
              {canDiscard && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button type="button" variant="ghost" size="icon" aria-label="その他の操作" />
                    }
                  >
                    <Ellipsis aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={locked}
                      onClick={() => {
                        discard.reset();
                        setDiscardOpen(true);
                      }}
                    >
                      <Trash2 aria-hidden />
                      下書きを破棄
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button type="submit" variant="outline" disabled={locked || busy}>
                <Save aria-hidden />
                保存
              </Button>
              <Button type="button" onClick={onPublishClick} disabled={locked || busy}>
                <Send aria-hidden />
                公開する
              </Button>
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {mode === "new" ? (
              <span>新しい手順書 ・ まだ保存していません</span>
            ) : (
              <>
                <span>
                  {meta.baseVersionNo ? `v${meta.baseVersionNo} をもとに編集` : "未公開の手順書"}
                </span>
                {meta.updatedBy && meta.updatedAt && (
                  <>
                    <span>・</span>
                    <span>
                      最終保存 <b className="font-medium text-foreground">{meta.updatedBy.name}</b>{" "}
                      {formatShortDateTime(meta.updatedAt)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {banner?.kind === "errors" && (
          <ErrorListBanner title={banner.title} rows={banner.rows} onJump={jumpTo} />
        )}
        {banner?.kind === "conflict" && (
          <ConflictBanner
            conflict={banner.conflict}
            reloading={reloading}
            onReload={onReload}
            onOpenLatest={() => window.open(`/procedures/${id}/edit`, "_blank", "noopener")}
          />
        )}
        {banner?.kind === "session" && <SessionBanner />}
        {banner?.kind === "error" && (
          <div className="mt-4">
            <ErrorBanner
              error={banner.error}
              message={
                banner.error instanceof Error && !isApiError(banner.error)
                  ? banner.error.message
                  : undefined
              }
            />
          </div>
        )}

        <div className="mt-4 grid gap-4">
          <BasicSection tagSuggestions={tagSuggestions} />
          <PrerequisitesSection />
          <VariablesSection />
          <section id="sec-steps" className="scroll-mt-48">
            <div className="mb-2 flex items-baseline gap-2">
              <SectionTitle icon={ListOrdered}>手順</SectionTitle>
            </div>
            <StepList name="steps" variables={variables} initiallyOpen={mode === "new" ? 0 : 2} />
          </section>
          <section id="sec-rb" className="mt-2 scroll-mt-48">
            <div className="mb-2 flex items-baseline gap-2">
              <SectionTitle icon={Undo2} iconClass="text-warning">
                切り戻し手順
              </SectionTitle>
            </div>
            <StepList name="rollbackSteps" variables={variables} initiallyOpen={0} />
          </section>
        </div>
      </form>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        nextVersionNo={nextVersionNo}
        pending={create.isPending || publish.isPending}
        error={publish.error ?? create.error}
        onPublish={onPublish}
      />
      <DiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        unpublished={meta.status === "unpublished"}
        baseVersionNo={meta.baseVersionNo}
        pending={discard.isPending}
        error={discard.error}
        onDiscard={onDiscard}
      />
      <UnsavedDialog
        open={blocker.status === "blocked"}
        onStay={() => blocker.reset?.()}
        onLeave={() => blocker.proceed?.()}
      />
    </FormProvider>
  );
}
