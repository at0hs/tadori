import type { ProcedureVariable } from "@tadori/shared";
import {
  Camera,
  ChevronsUpDown,
  CircleCheck,
  FileText,
  ListOrdered,
  ListTodo,
  Lock,
  Minus,
  Plus,
  Tag,
  Undo2,
  Variable,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isChanged, type ProcedureDiff, type StepDiff, type VariableDiff } from "./compute.ts";
import { BeforeAfter, ChangeBadge, InlineDiff, LineDiffBlock } from "./diff-parts.tsx";

// S-17 の本文のカード（ui.md 10.2・10.3、mockups/diff.html の案1）。
// 説明・前提条件は Markdown だが、差分では書いたままの文字を出す。

const CARD = "rounded-xl border bg-card p-5";

function SectionHead({
  id,
  icon: Icon,
  label,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 id={id} className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </h2>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 text-sm">
      <span className="w-14 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 break-words whitespace-pre-wrap">{children}</div>
    </div>
  );
}

/** 基本情報（タイトル・概要・タグ）。違いがあるときだけ出す。 */
export function BasicCard({ diff }: { diff: ProcedureDiff }) {
  const title = isChanged(diff.title);
  const summary = isChanged(diff.summary);
  const tags = diff.tags.some((t) => t.kind !== "same");
  if (!title && !summary && !tags) return null;
  return (
    <section className={CARD} aria-labelledby="diff-basic">
      <SectionHead id="diff-basic" icon={FileText} label="基本情報">
        <ChangeBadge kind="mod" />
      </SectionHead>
      <div className="mt-2 divide-y">
        {title && (
          <FieldRow label="タイトル">
            <InlineDiff parts={diff.title} />
          </FieldRow>
        )}
        {summary && (
          <FieldRow label="概要">
            <InlineDiff parts={diff.summary} />
          </FieldRow>
        )}
        {tags && (
          <FieldRow label="タグ">
            <div className="flex flex-wrap gap-1">
              {diff.tags.map((t) => (
                <Badge
                  key={t.tag}
                  variant="outline"
                  className={cn(
                    t.kind === "add" && "border-success/40 bg-success/10 text-success",
                    t.kind === "del" &&
                      "border-destructive/40 bg-destructive/10 text-destructive line-through",
                  )}
                >
                  {t.kind === "add" ? (
                    <Plus aria-label="追加" />
                  ) : t.kind === "del" ? (
                    <Minus aria-label="削除" />
                  ) : (
                    <Tag className="text-muted-foreground" aria-hidden />
                  )}
                  {t.tag}
                </Badge>
              ))}
            </div>
          </FieldRow>
        )}
      </div>
    </section>
  );
}

/** 前提条件。足した行・消した行だけを出し、隠した行の数を添える。 */
export function PrerequisitesCard({ diff }: { diff: ProcedureDiff }) {
  if (!isChanged(diff.prerequisites)) return null;
  const changed = diff.prerequisites.filter((l) => l.kind !== "same");
  const hidden = diff.prerequisites.length - changed.length;
  return (
    <section className={CARD} aria-labelledby="diff-pre">
      <SectionHead id="diff-pre" icon={ListTodo} label="前提条件">
        <ChangeBadge kind="mod" />
      </SectionHead>
      <ul className="mt-2 space-y-1 text-sm">
        {changed.map((l, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 行の並びは固定
            key={i}
            className={cn(
              "flex items-start gap-2 rounded px-1 break-words whitespace-pre-wrap",
              l.kind === "add" ? "bg-success/10" : "bg-destructive/10",
            )}
          >
            <span className={l.kind === "add" ? "text-success" : "text-destructive"} aria-hidden>
              {l.kind === "add" ? "+" : "−"}
            </span>
            <span className="sr-only">{l.kind === "add" ? "追加した行：" : "削除した行："}</span>
            <span
              className={cn(
                "min-w-0",
                l.kind === "del" && "line-through decoration-destructive/60",
              )}
            >
              {l.parts.every((p) => p.text === "") ? (
                "（空の行）"
              ) : (
                <InlineDiff parts={l.parts} strong />
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">変更のない {hidden} 行を隠しています</p>
      )}
    </section>
  );
}

function DefaultValue({ v }: { v: ProcedureVariable | null }) {
  if (!v) return null;
  if (v.secret)
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        <Lock aria-hidden />
        秘密
      </Badge>
    );
  return <span className="font-mono text-[13px]">{v.default ?? ""}</span>;
}

function VariableDefault({ d }: { d: VariableDiff }) {
  const { before, after } = d;
  if (d.status !== "mod" || !before || !after) return <DefaultValue v={after ?? before} />;
  if (before.secret !== after.secret) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">秘密：</span>
        <BeforeAfter
          before={before.secret ? "あり" : "なし"}
          after={after.secret ? "あり" : "なし"}
        />
      </span>
    );
  }
  if (before.default !== after.default) {
    return (
      <BeforeAfter
        className="font-mono text-[13px]"
        before={before.default ?? "なし"}
        after={after.default ?? "なし"}
      />
    );
  }
  return <DefaultValue v={after} />;
}

/** 変数。変わった変数だけの表。 */
export function VariablesCard({ diff }: { diff: ProcedureDiff }) {
  const rows = diff.variables.filter((v) => v.status !== "same");
  if (rows.length === 0) return null;
  const hidden = diff.variables.length - rows.length;
  return (
    <section className={CARD} aria-labelledby="diff-vars">
      <SectionHead id="diff-vars" icon={Variable} label="変数">
        <ChangeBadge kind="mod" />
      </SectionHead>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1.5 font-normal">変数</th>
            <th className="font-normal">説明</th>
            <th className="font-normal">既定値</th>
            <th>
              <span className="sr-only">変更の種類</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr
              key={v.name}
              className={cn(
                "border-b last:border-0",
                v.status === "mod" && "bg-warning/5",
                v.status === "add" && "bg-success/5",
                v.status === "del" && "bg-destructive/5",
              )}
            >
              <td className="py-2 pr-4">
                <span
                  className={cn(
                    "font-mono text-[13px]",
                    v.status === "del" && "line-through decoration-destructive/60",
                  )}
                >{`#{${v.name}}`}</span>
              </td>
              <td className="pr-4 break-words">
                <InlineDiff parts={v.description} />
              </td>
              <td className="pr-4">
                <VariableDefault d={v} />
              </td>
              <td className="text-right">
                {v.status !== "same" && <ChangeBadge kind={v.status} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">変更のない {hidden} 件を隠しています</p>
      )}
    </section>
  );
}

function EvidenceLine({ e }: { e: StepDiff["evidenceRequired"] }) {
  if (e.before !== null && e.after !== null && e.before !== e.after) {
    return (
      <div className="mt-2.5 flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">エビデンス必須：</span>
        <BeforeAfter before={e.before ? "あり" : "なし"} after={e.after ? "あり" : "なし"} />
      </div>
    );
  }
  return null;
}

const evidenceBadge = (
  <Badge variant="outline" className="border-primary/30 text-accent-foreground">
    <Camera aria-hidden />
    エビデンス必須
  </Badge>
);

function barClass(s: StepDiff) {
  if (s.status === "add") return "border-l-success";
  if (s.status === "del") return "border-l-destructive";
  if (s.moved) return "border-l-primary";
  if (s.status === "mod") return "border-l-warning";
  return "border-l-transparent";
}

function DiffStepItem({ s, rollback }: { s: StepDiff; rollback?: boolean }) {
  const del = s.status === "del";
  const no = del ? s.oldNo : s.newNo;
  const ev = s.evidenceRequired;
  // 前後で違うときは EvidenceLine で「なし → あり」と出す。片方にしかないか同じなら、今のバッジ
  const evChanged = ev.before !== null && ev.after !== null && ev.before !== ev.after;
  const showEvBadge = !evChanged && (ev.after ?? ev.before) === true;
  return (
    <li
      id={`diff-step-${s.id}`}
      className={cn(
        "-ml-5 flex scroll-mt-4 gap-4 border-b border-l-4 py-5 pl-4 last:border-b-0",
        barClass(s),
        s.status === "add" && "bg-success/5",
        del && "bg-destructive/5",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
          del
            ? "bg-destructive/10 text-destructive line-through"
            : rollback
              ? "bg-warning/15 text-warning"
              : "bg-accent text-accent-foreground",
        )}
        aria-hidden
      >
        {no}
      </span>
      <div className="min-w-0 flex-1">
        {(s.status !== "same" || s.moved) && (
          <div className="mb-1.5 flex gap-1.5">
            {s.status !== "same" && <ChangeBadge kind={s.status} />}
            {s.moved && s.oldNo !== null && s.newNo !== null && (
              <ChangeBadge kind="move" from={s.oldNo} to={s.newNo} />
            )}
          </div>
        )}
        <div className={cn(del && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("font-semibold", del && "line-through decoration-destructive/60")}>
              <span className="sr-only">{no}. </span>
              <InlineDiff parts={s.title} />
            </h3>
            {showEvBadge && evidenceBadge}
          </div>
          {s.description.length > 0 && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">
              <InlineDiff parts={s.description} />
            </p>
          )}
          {s.command.length > 0 &&
            (isChanged(s.command) ? (
              <LineDiffBlock lines={s.command} className="mt-2.5" />
            ) : (
              <pre className="mt-2.5 rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">
                <InlineDiff
                  parts={s.command.flatMap((l, i) =>
                    i === 0 ? l.parts : [{ kind: "same" as const, text: "\n" }, ...l.parts],
                  )}
                />
              </pre>
            ))}
          {s.verification.length > 0 && (
            <div className="mt-2.5 flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span className="break-words whitespace-pre-wrap">
                <span className="text-muted-foreground">確認：</span>
                <InlineDiff parts={s.verification} />
              </span>
            </div>
          )}
          <EvidenceLine e={ev} />
        </div>
      </div>
    </li>
  );
}

const unchanged = (s: StepDiff) => s.status === "same" && !s.moved;

/** ステップの並び。変更のないステップが続くところは1行にまとめ、押すとその場所だけ開く。 */
function DiffStepList({ steps, rollback }: { steps: StepDiff[]; rollback?: boolean }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const out: React.ReactNode[] = [];
  let run: StepDiff[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const key = run[0]?.id ?? "";
    if (open.has(key)) {
      for (const s of run) out.push(<DiffStepItem key={s.id} s={s} rollback={rollback} />);
    } else {
      const nos = run.map((s) => s.newNo).join("・");
      out.push(
        <li
          key={`run-${key}`}
          className="-ml-5 border-b border-l-4 border-l-transparent py-2 pl-4 last:border-b-0"
        >
          <button
            type="button"
            onClick={() => setOpen((o) => new Set(o).add(key))}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronsUpDown className="size-4" aria-hidden />
            変更のないステップ {run.length} 件（{nos}）を表示
          </button>
        </li>,
      );
    }
    run = [];
  };
  for (const s of steps) {
    if (unchanged(s)) {
      run.push(s);
    } else {
      flush();
      out.push(<DiffStepItem key={s.id} s={s} rollback={rollback} />);
    }
  }
  flush();
  return <ol>{out}</ol>;
}

/** 手順・切り戻し手順。変更がなくても出し、ステップ数を添える。 */
export function StepsCard({
  kind,
  steps,
  baseVersionNo,
}: {
  kind: "steps" | "rollbackSteps";
  steps: StepDiff[];
  baseVersionNo: number;
}) {
  const rollback = kind === "rollbackSteps";
  const id = rollback ? "diff-rollback" : "diff-steps";
  const now = steps.filter((s) => s.newNo !== null).length;
  const before = steps.filter((s) => s.oldNo !== null).length;
  return (
    <section className={CARD} aria-labelledby={id}>
      <SectionHead
        id={id}
        icon={rollback ? Undo2 : ListOrdered}
        label={rollback ? "切り戻し手順" : "手順"}
      >
        <span className="text-sm text-muted-foreground">
          {now} ステップ（v{baseVersionNo} は {before}）
        </span>
      </SectionHead>
      {steps.length > 0 && (
        <div className="mt-3 pl-5">
          <DiffStepList steps={steps} rollback={rollback} />
        </div>
      )}
    </section>
  );
}
