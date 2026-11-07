import { Archive } from "lucide-react";
import { ErrorBanner } from "@/components/error-banner.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatShortDateTime } from "@/lib/format.ts";
import { useArchive } from "./queries.ts";

// アーカイブの確認（screens.md 4章、ui.md 7.3）。取り返しがつかないので赤。下書きがあれば破棄されることを伝える（D-07）。
export function ArchiveDialog({
  procedureId,
  title,
  draft,
  open,
  onOpenChange,
}: {
  procedureId: string;
  title: string;
  draft: { updatedBy: { name: string }; updatedAt: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const archive = useArchive(procedureId);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) archive.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <div className="flex gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Archive className="size-4" aria-hidden />
          </div>
          <div className="grid gap-1">
            <AlertDialogTitle className="font-semibold">
              「{title}」をアーカイブしますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              アーカイブすると、この手順書から新しい実行を始められなくなり、編集もできなくなります。元に戻せません。
            </AlertDialogDescription>
          </div>
        </div>
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          {draft && (
            <p>
              編集中の下書き（{draft.updatedBy.name}、{formatShortDateTime(draft.updatedAt)}{" "}
              保存）は破棄されます。
            </p>
          )}
          <p>進行中の実行は、そのまま続けられます。</p>
        </div>
        {archive.error && <ErrorBanner error={archive.error} />}
        <div className="mt-2 flex justify-end gap-2">
          <AlertDialogCancel variant="ghost">キャンセル</AlertDialogCancel>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
            disabled={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            アーカイブする
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
