import { Send, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "@/components/error-banner.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// 編集画面のダイアログ（screens.md 4章、ui.md 7.5）：公開、下書きの破棄、未保存の変更の確認。

const DESTRUCTIVE = "bg-destructive text-destructive-foreground hover:bg-destructive/85";

function DialogHead({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "destructive" | "warning";
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-accent text-accent-foreground";
  return (
    <div className="flex gap-3">
      <div className={`grid size-9 shrink-0 place-items-center rounded-full ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="grid gap-1">
        <AlertDialogTitle className="font-semibold">{title}</AlertDialogTitle>
        <AlertDialogDescription>{children}</AlertDialogDescription>
      </div>
    </div>
  );
}

/** 公開。変更理由は必須（F-03）。 */
export function PublishDialog({
  open,
  onOpenChange,
  nextVersionNo,
  pending,
  error,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextVersionNo: number;
  pending: boolean;
  error: unknown;
  onPublish: (changeReason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const empty = reason.trim() === "";
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // 送信中は閉じない（結果を見届けられるように）
        if (!next && pending) return;
        if (!next) setTouched(false);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!empty) onPublish(reason.trim());
          }}
        >
          <DialogHead icon={Send} tone="primary" title={`v${nextVersionNo} として公開しますか？`}>
            画面の内容を保存して公開します。公開した版は変更できません。
          </DialogHead>
          <div className="grid gap-1.5">
            <label htmlFor="change-reason" className="text-sm font-medium">
              変更理由 <span className="text-xs font-normal text-destructive">必須</span>
            </label>
            <Textarea
              id="change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：文法チェックの手順を足した"
              aria-invalid={touched && empty ? true : undefined}
            />
            {touched && empty ? (
              <p className="text-sm text-destructive">変更理由を入力してください。</p>
            ) : (
              <p className="text-xs text-muted-foreground">版の一覧に出ます</p>
            )}
          </div>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            これから始める実行は v{nextVersionNo}{" "}
            を使います。進行中の実行は、始めたときの版のまま続きます。
          </div>
          {error ? <ErrorBanner error={error} /> : null}
          <div className="flex justify-end gap-2">
            <AlertDialogCancel variant="ghost" disabled={pending}>
              キャンセル
            </AlertDialogCancel>
            <Button type="submit" disabled={pending}>
              公開する
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 下書きの破棄（D-29）。未公開なら手順書ごと削除されることを伝える。 */
export function DiscardDialog({
  open,
  onOpenChange,
  unpublished,
  baseVersionNo,
  pending,
  error,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unpublished: boolean;
  baseVersionNo: number | null;
  pending: boolean;
  error: unknown;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next || !pending) && onOpenChange(next)}>
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <DialogHead icon={Trash2} tone="destructive" title="下書きを破棄しますか？">
          {unpublished ? (
            <>
              この手順書は一度も公開していないため、下書きを破棄すると
              <b className="text-foreground">手順書ごと削除されます</b>。元に戻せません。
            </>
          ) : (
            <>下書きを消して、公開済みの v{baseVersionNo} の状態に戻します。元に戻せません。</>
          )}
        </DialogHead>
        {!unpublished && (
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            この下書きに保存された変更は、ほかの人が保存したものも含めてすべて消えます。
          </div>
        )}
        {error ? <ErrorBanner error={error} /> : null}
        <div className="mt-2 flex justify-end gap-2">
          <AlertDialogCancel variant="ghost" disabled={pending}>
            キャンセル
          </AlertDialogCancel>
          <Button className={DESTRUCTIVE} disabled={pending} onClick={onDiscard}>
            {unpublished ? "手順書ごと削除" : "下書きを破棄"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 画面内の移動で、未保存の変更があるとき。 */
export function UnsavedDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <DialogHead icon={TriangleAlert} tone="warning" title="保存していない変更があります">
          このまま移動すると、保存していない変更は失われます。
        </DialogHead>
        <div className="mt-2 flex justify-end gap-2">
          <AlertDialogCancel variant="ghost">編集を続ける</AlertDialogCancel>
          <Button className={DESTRUCTIVE} onClick={onLeave}>
            変更を捨てて移動
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
