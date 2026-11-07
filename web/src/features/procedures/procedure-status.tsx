import type { ProcedureStatus as Status } from "@tadori/shared";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Dot({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", color)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** 手順書の状態（ui.md 7.2）。編集中は「公開済み」の点に「編集中」のバッジを添える。 */
export function ProcedureStatusLabel({ status }: { status: Status }) {
  switch (status) {
    case "published":
      return <Dot label="公開済み" color="text-success" />;
    case "editing":
      return (
        <span className="inline-flex items-center gap-2">
          <Dot label="公開済み" color="text-success" />
          <Badge variant="outline" className="border-warning/40 text-warning">
            <Pencil aria-hidden />
            編集中
          </Badge>
        </span>
      );
    case "unpublished":
      return <Dot label="未公開" color="text-muted-foreground" />;
    case "archived":
      return <Dot label="アーカイブ" color="text-muted-foreground" />;
  }
}
