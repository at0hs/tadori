import type { ProcedureStatus, UserRef } from "@tadori/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { procedureDrafts, procedures, procedureVersions } from "../../db/schema/procedures.ts";

// 手順書の読み出しのうち、読み込みと書き込みのサービスで共有するもの。

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

export type ProcedureRow = typeof procedures.$inferSelect;
export type VersionRow = typeof procedureVersions.$inferSelect;
export type DraftRow = typeof procedureDrafts.$inferSelect;

/** 版・下書きの文書（jsonb）から題名だけを読む。一覧で文書全体を読まないため。 */
export const titleOf = (content: AnyPgColumn) => sql<string>`${content}->>'title'`;

/** 手順書の状態（state-transitions.md 2.1）。 */
export function statusOf(row: ProcedureRow, hasDraft: boolean): ProcedureStatus {
  if (row.status === "archived") return "archived";
  if (row.latestVersionNo === null) return "unpublished";
  return hasDraft ? "editing" : "published";
}

/** ユーザーの ID から名前を引く表。記録の中のユーザーは ID と名前だけを返す（D-49）。 */
export async function userNames(ex: Executor, ids: string[]): Promise<(id: string) => UserRef> {
  const unique = [...new Set(ids)];
  const rows =
    unique.length === 0
      ? []
      : await ex
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, unique));
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return (id) => ({ id, name: names.get(id) ?? "" });
}

/** 手順書ごとの最新版（未公開の手順書は含まない）。 */
export async function latestVersionsOf(
  ex: Executor,
  procedureIds: string[],
): Promise<Map<string, VersionRow>> {
  if (procedureIds.length === 0) return new Map();
  const rows = await ex
    .select({ v: procedureVersions })
    .from(procedureVersions)
    .innerJoin(
      procedures,
      and(
        eq(procedures.id, procedureVersions.procedureId),
        eq(procedures.latestVersionNo, procedureVersions.versionNo),
      ),
    )
    .where(inArray(procedureVersions.procedureId, procedureIds));
  return new Map(rows.map(({ v }) => [v.procedureId, v]));
}

/** 手順書ごとの下書き。 */
export async function draftsOf(
  ex: Executor,
  procedureIds: string[],
): Promise<Map<string, DraftRow>> {
  if (procedureIds.length === 0) return new Map();
  const rows = await ex
    .select()
    .from(procedureDrafts)
    .where(inArray(procedureDrafts.procedureId, procedureIds));
  return new Map(rows.map((d) => [d.procedureId, d]));
}

/** 1件の手順書の行。なければ undefined。 */
export async function findProcedure(
  ex: Executor,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<ProcedureRow | undefined> {
  const q = ex.select().from(procedures).where(eq(procedures.id, id));
  const [row] = opts.forUpdate ? await q.for("update") : await q;
  return row;
}
