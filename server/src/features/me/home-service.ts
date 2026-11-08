import type { HomeDraft, HomeExecution, MeHomeResponse } from "@tadori/shared";
import { and, eq, ne, or } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { executions } from "../../db/schema/executions.ts";
import { procedureDrafts, procedures } from "../../db/schema/procedures.ts";
import type { Actor } from "../../lib/hono.ts";
import { summarizeExecutions } from "../executions/read-service.ts";
import { titleOf, userNames } from "../procedures/queries.ts";

// ホーム（S-03、api.md 4.2）。持っているロールの区画だけを返す（D-40）。
// 区画ごとに全件を返し、出す件数は画面で決める（件数が少ないため、D-16）。

/** 日時（ISO 文字列）で並べ、同じなら id で決める。 */
function byTime<T extends { id: string }>(key: (x: T) => string, order: "asc" | "desc") {
  const sign = order === "asc" ? 1 : -1;
  return (a: T, b: T) => sign * (key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

/** 自分が実行者で、実行中か差し戻しの実行。最終更新の新しい順。 */
async function myExecutions(userId: string): Promise<HomeExecution[]> {
  const rows = await summarizeExecutions(
    and(
      eq(executions.executorId, userId),
      or(eq(executions.status, "running"), eq(executions.approvalStatus, "rejected")),
    ),
  );
  return rows.sort(byTime((e) => e.updatedAt, "desc"));
}

/** 承認を待っている、自分が実行者でない実行。終了日時の古い順（長く待たせているものから）。 */
async function pendingApprovals(userId: string): Promise<HomeExecution[]> {
  const rows = await summarizeExecutions(
    and(eq(executions.approvalStatus, "pending"), ne(executions.executorId, userId)),
  );
  return rows.sort(byTime((e) => e.endedAt ?? "", "asc"));
}

/** 下書きのある手順書（未公開を含む）。最終更新の新しい順。 */
async function drafts(): Promise<HomeDraft[]> {
  const rows = await db
    .select({
      p: procedures,
      title: titleOf(procedureDrafts.content),
      updatedBy: procedureDrafts.updatedBy,
      updatedAt: procedureDrafts.updatedAt,
    })
    .from(procedureDrafts)
    .innerJoin(procedures, eq(procedures.id, procedureDrafts.procedureId))
    .where(eq(procedures.status, "active"));
  const name = await userNames(
    db,
    rows.map((r) => r.updatedBy),
  );
  return rows
    .map(
      ({ p, title, updatedBy, updatedAt }): HomeDraft => ({
        id: p.id,
        title,
        status: p.latestVersionNo === null ? "unpublished" : "editing",
        updatedBy: name(updatedBy),
        updatedAt: updatedAt.toISOString(),
      }),
    )
    .sort(byTime((x) => x.updatedAt, "desc"));
}

export async function getHome(actor: Actor): Promise<MeHomeResponse> {
  const has = (role: Actor["roles"][number]) => actor.roles.includes(role);
  const [mine, pending, editing] = await Promise.all([
    has("executor") ? myExecutions(actor.id) : undefined,
    has("approver") ? pendingApprovals(actor.id) : undefined,
    has("author") ? drafts() : undefined,
  ]);
  const body: MeHomeResponse = {};
  if (mine) body.myExecutions = mine;
  if (pending) body.pendingApprovals = pending;
  if (editing) body.drafts = editing;
  return body;
}
