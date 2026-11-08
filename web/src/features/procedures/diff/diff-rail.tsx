import type { UserRef } from "@tadori/shared";
import { GitCompare, ListTree } from "lucide-react";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import type { ProcedureDiff, StepDiff } from "./compute.ts";
import type { DiffSummary } from "./summary.ts";
import { summaryRows } from "./summary.ts";

// S-17 の右の欄（ui.md 10.2）。比べているものと、変更の概要・変わったステップの目次・凡例。

const CARD = "rounded-xl border bg-card p-5";

function dotClass(s: StepDiff) {
  if (s.status === "add") return "bg-success";
  if (s.status === "del") return "bg-destructive";
  if (s.moved) return "bg-primary";
  return "bg-warning";
}

function StepToc({ label, steps }: { label: string; steps: StepDiff[] }) {
  const changed = steps.filter((s) => s.status !== "same" || s.moved);
  if (changed.length === 0) return null;
  return (
    <>
      <div className="mt-3 text-xs font-medium text-muted-foreground">{label}</div>
      <ul>
        {changed.map((s) => {
          const del = s.status === "del";
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`diff-step-${s.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className={cn("size-2 shrink-0 rounded-full", dotClass(s))} aria-hidden />
                <span className="w-4 shrink-0 text-right text-xs tabular-nums">
                  {del ? s.oldNo : s.newNo}
                </span>
                <span className={cn("truncate", del && "line-through")}>
                  {s.title.map((p) => (p.kind === "del" ? "" : p.text)).join("") ||
                    s.title.map((p) => p.text).join("")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const LEGEND = [
  ["bg-success", "追加"],
  ["bg-destructive", "削除"],
  ["bg-warning", "変更"],
  ["bg-primary", "移動"],
] as const;

export function DiffRail({
  diff,
  summary,
  base,
  draft,
}: {
  diff: ProcedureDiff;
  summary: DiffSummary;
  base: { versionNo: number; publishedBy: UserRef; publishedAt: string };
  draft: { updatedBy: UserRef | null; updatedAt: string | null };
}) {
  return (
    <aside className="grid gap-4 lg:sticky lg:top-4">
      <section className={CARD} aria-labelledby="diff-compare">
        <h2 id="diff-compare" className="flex items-center gap-2 font-semibold">
          <GitCompare className="size-4 text-muted-foreground" aria-hidden />
          比べているもの
        </h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">公開済み</dt>
            <dd>
              v{base.versionNo} ・ {base.publishedBy.name} ・{" "}
              {formatShortDateTime(base.publishedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">下書き（保存したもの）</dt>
            <dd>
              {draft.updatedBy?.name ?? "—"}
              {draft.updatedAt && ` ・ ${formatShortDateTime(draft.updatedAt)}`}
            </dd>
          </div>
        </dl>
      </section>
      <section className={CARD} aria-labelledby="diff-overview">
        <h2 id="diff-overview" className="flex items-center gap-2 font-semibold">
          <ListTree className="size-4 text-muted-foreground" aria-hidden />
          変更の概要
        </h2>
        <dl className="mt-2 grid gap-1.5 text-sm">
          {summaryRows(summary).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 border-t pt-1">
          <StepToc label="手順" steps={diff.steps} />
          <StepToc label="切り戻し手順" steps={diff.rollbackSteps} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          {LEGEND.map(([cls, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", cls)} aria-hidden />
              {label}
            </span>
          ))}
        </div>
      </section>
    </aside>
  );
}
