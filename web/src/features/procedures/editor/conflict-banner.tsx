import type { DraftConflict } from "@tadori/shared";
import { CircleAlert, ExternalLink, LogIn, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortDateTime } from "@/lib/format.ts";
import type { ErrorRow } from "./form.ts";

// 編集画面の帯（ui.md 7.5）：楽観ロックのエラー、セッション切れ、検証エラーの一覧。

function conflictText(c: DraftConflict): string {
  const when = c.updatedAt ? formatShortDateTime(c.updatedAt) : "";
  switch (c.reason) {
    case "draft_saved":
      return `${c.updatedBy?.name ?? "ほかの人"} が ${when} に保存しました。`;
    case "version_published":
      return `${c.updatedBy?.name ?? "ほかの人"} が ${when} に新しい版を公開しました。`;
    case "draft_discarded":
      return "下書きが破棄されたか、公開されました。";
  }
}

/** 楽観ロックのエラー（D-05、D-55）。上書きする手段は出さない。 */
export function ConflictBanner({
  conflict,
  onOpenLatest,
  onReload,
  reloading,
}: {
  conflict: DraftConflict;
  onOpenLatest: () => void;
  onReload: () => void;
  reloading: boolean;
}) {
  const title =
    conflict.reason === "draft_saved"
      ? "保存できませんでした。ほかの人が先に下書きを保存しています"
      : "保存できませんでした。読み込んだ後に手順書が変わっています";
  return (
    <div
      role="alert"
      className="mt-4 animate-in rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm duration-200 fade-in-0"
    >
      <div className="flex items-start gap-2 text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-foreground">
            {conflictText(conflict)}
            あなたの入力はこの画面に残っていますが、このままでは保存・公開できません。
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <Button type="button" variant="outline" onClick={onOpenLatest}>
          <ExternalLink aria-hidden />
          最新の下書きを新しいタブで開く
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={onReload}
          disabled={reloading}
        >
          <RotateCcw aria-hidden />
          自分の変更を捨てて読み込み直す
        </Button>
      </div>
      <p className="mt-2 pl-6 text-xs text-muted-foreground">
        必要な変更は、新しいタブの最新の下書きに手で入れ直してください（差分は出しません）。
      </p>
    </div>
  );
}

/** セッション切れ。この画面だけはログイン画面に移さない（screens.md 8章）。 */
export function SessionBanner() {
  return (
    <div
      role="alert"
      className="mt-4 flex animate-in items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm duration-200 fade-in-0"
    >
      <LogIn className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">ログインの有効期限が切れました</p>
        <p className="mt-0.5">
          入力中の内容はこの画面に残っています。別のタブでログインし直してから、もう一度保存してください。
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => window.open("/login", "_blank", "noopener")}
        >
          <ExternalLink aria-hidden />
          ログイン画面を新しいタブで開く
        </Button>
      </div>
    </div>
  );
}

/** 検証エラーの一覧。押すとその場所へ移る。 */
export function ErrorListBanner({
  title,
  rows,
  onJump,
}: {
  title: string;
  rows: ErrorRow[];
  onJump: (path: string) => void;
}) {
  return (
    <div
      role="alert"
      className="mt-4 animate-in rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive duration-200 fade-in-0"
    >
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{title}</p>
          <ul className="mt-1 space-y-0.5 text-foreground">
            {rows.map((r) => (
              <li key={`${r.path}:${r.message}`}>
                <button
                  type="button"
                  onClick={() => onJump(r.path)}
                  className="underline-offset-2 hover:underline"
                >
                  {r.label}
                </button>
                ：{r.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
