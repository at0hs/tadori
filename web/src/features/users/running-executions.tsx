import type { RunningExecution } from "@tadori/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Coffee } from "lucide-react";
import { formatShortDateTime } from "@/lib/format.ts";

/** S-15 の「実行中の実行」（D-36）。そのユーザーが実行者で、まだ終わっていない実行 */
export function RunningExecutions({ executions }: { executions: RunningExecution[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="実行中の実行">
      <div className="flex items-baseline gap-2 px-5 pt-5">
        <h2 className="font-semibold">実行中の実行</h2>
        <span className="text-2xl font-semibold tabular-nums">{executions.length}</span>
        <span className="text-sm text-muted-foreground">件</span>
      </div>
      {executions.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <Coffee className="size-5" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-medium">実行中の実行はありません</p>
          <p className="text-xs text-muted-foreground">
            このユーザーが始めた実行は、すべて終わっています
          </p>
        </div>
      ) : (
        <ul className="mt-3 border-t">
          {executions.map((e) => (
            <li key={e.id}>
              <Link
                to="/executions/$executionId"
                params={{ executionId: e.id }}
                className="flex items-center gap-4 border-b px-5 py-3 transition-colors last:border-0 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {e.procedure.title}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      v{e.versionNo}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    開始 {formatShortDateTime(e.startedAt)} ・ 最終更新{" "}
                    {formatShortDateTime(e.updatedAt)}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
