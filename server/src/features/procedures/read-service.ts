import {
  can,
  type DraftResponse,
  type ProcedureDetailResponse,
  type ProcedureSummary,
  type ProcedureVersionListResponse,
  type ProcedureVersionResponse,
} from "@tadori/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { procedures, procedureVersions } from "../../db/schema/procedures.ts";
import { AppError } from "../../lib/errors.ts";
import type { Actor } from "../../lib/hono.ts";
import {
  draftsOf,
  findProcedure,
  latestVersionsOf,
  type ProcedureRow,
  statusOf,
  titleOf,
  userNames,
} from "./queries.ts";

// 手順書の読み込み（api.md 4.3）。応答に含める情報は api.md 3章（D-49）に従う。
// - 下書きの中身は getDraft だけが返す。一覧・詳細のタイトル・タグは最新版の文書から取る。
// - 未公開の手順書は作業者以上のロールの人にだけ返す（D-34）。

const canEditDrafts = (actor: Actor) => can(actor.role, "editProcedure");

/** 見てよい手順書の行を返す。なければ・見てはいけなければ NOT_FOUND（authorization.md 2章の 4）。 */
async function visibleProcedure(actor: Actor, id: string): Promise<ProcedureRow> {
  const row = await findProcedure(db, id);
  if (!row) throw new AppError("NOT_FOUND");
  if (row.latestVersionNo === null && !canEditDrafts(actor)) throw new AppError("NOT_FOUND");
  return row;
}

/** 手順書の一覧（S-04）。絞り込み・並べ替えは画面で行う（D-16）。 */
export async function listProcedures(actor: Actor): Promise<ProcedureSummary[]> {
  const all = await db.select().from(procedures);
  const rows = canEditDrafts(actor) ? all : all.filter((r) => r.latestVersionNo !== null);
  const ids = rows.map((r) => r.id);
  const [versions, drafts] = await Promise.all([latestVersionsOf(db, ids), draftsOf(db, ids)]);

  return rows.flatMap((row) => {
    const version = versions.get(row.id);
    const draft = drafts.get(row.id);
    // 未公開なら下書きから（作成者だけがここに来る）、公開済みなら最新版から取る
    const content = version?.content ?? draft?.content;
    if (!content) return [];
    return [
      {
        id: row.id,
        title: content.title,
        summary: content.summary,
        tags: content.tags,
        status: statusOf(row, draft !== undefined),
        latestVersionNo: row.latestVersionNo,
        lastPublishedAt: version?.publishedAt.toISOString() ?? null,
      },
    ];
  });
}

/** 手順書の詳細（S-05）。下書きの最終更新者・日時は作成者にだけ返す。 */
export async function getProcedure(actor: Actor, id: string): Promise<ProcedureDetailResponse> {
  const row = await visibleProcedure(actor, id);
  const [versions, drafts] = await Promise.all([latestVersionsOf(db, [id]), draftsOf(db, [id])]);
  const version = versions.get(id);
  const draft = drafts.get(id);
  const name = await userNames(db, [
    ...(version ? [version.publishedBy] : []),
    ...(draft ? [draft.updatedBy] : []),
  ]);

  return {
    id,
    status: statusOf(row, draft !== undefined),
    latestVersion: version
      ? {
          versionNo: version.versionNo,
          content: version.content,
          publishedBy: name(version.publishedBy),
          publishedAt: version.publishedAt.toISOString(),
          changeReason: version.changeReason,
        }
      : null,
    draft:
      draft && canEditDrafts(actor)
        ? { updatedBy: name(draft.updatedBy), updatedAt: draft.updatedAt.toISOString() }
        : null,
  };
}

/** 版の一覧（S-06）。新しい順。 */
export async function listVersions(
  actor: Actor,
  id: string,
): Promise<ProcedureVersionListResponse> {
  const row = await visibleProcedure(actor, id);
  if (row.latestVersionNo === null) throw new AppError("NOT_FOUND");
  const versions = await db
    .select({
      versionNo: procedureVersions.versionNo,
      title: titleOf(procedureVersions.content),
      changeReason: procedureVersions.changeReason,
      publishedBy: procedureVersions.publishedBy,
      publishedAt: procedureVersions.publishedAt,
    })
    .from(procedureVersions)
    .where(eq(procedureVersions.procedureId, id))
    .orderBy(desc(procedureVersions.versionNo));
  const name = await userNames(
    db,
    versions.map((v) => v.publishedBy),
  );
  return {
    title: versions[0]?.title ?? "",
    versions: versions.map((v) => ({
      versionNo: v.versionNo,
      changeReason: v.changeReason,
      publishedBy: name(v.publishedBy),
      publishedAt: v.publishedAt.toISOString(),
    })),
  };
}

/** 版の内容（S-07）。 */
export async function getVersion(
  actor: Actor,
  id: string,
  versionNo: number,
): Promise<ProcedureVersionResponse> {
  const row = await visibleProcedure(actor, id);
  const [version] = await db
    .select()
    .from(procedureVersions)
    .where(and(eq(procedureVersions.procedureId, id), eq(procedureVersions.versionNo, versionNo)));
  if (!version || row.latestVersionNo === null) throw new AppError("NOT_FOUND");
  const name = await userNames(db, [version.publishedBy]);
  return {
    title: version.content.title,
    versionNo: version.versionNo,
    content: version.content,
    publishedBy: name(version.publishedBy),
    publishedAt: version.publishedAt.toISOString(),
    changeReason: version.changeReason,
    latestVersionNo: row.latestVersionNo,
  };
}

/**
 * 編集画面に読み込む内容（S-09）。作成者ロールの確認はルートで済んでいる。
 * 下書きがあれば下書きと revision、なければ最新版の文書と版数（D-28、D-55）。
 */
export async function getDraft(actor: Actor, id: string): Promise<DraftResponse> {
  const row = await visibleProcedure(actor, id);
  if (row.status === "archived") {
    throw new AppError("STATE_CONFLICT", "アーカイブした手順書は編集できません。");
  }
  const draft = (await draftsOf(db, [id])).get(id);
  if (draft) {
    const name = await userNames(db, [draft.updatedBy]);
    return {
      status: statusOf(row, true),
      content: draft.content,
      lock: { revision: draft.revision },
      baseVersionNo: draft.baseVersionNo,
      updatedBy: name(draft.updatedBy),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
  const version = (await latestVersionsOf(db, [id])).get(id);
  if (!version || row.latestVersionNo === null) {
    // 未公開の手順書には必ず下書きがある（state-transitions.md 2.1）
    throw new AppError("NOT_FOUND");
  }
  return {
    status: statusOf(row, false),
    content: version.content,
    lock: { revision: null, versionNo: row.latestVersionNo },
    baseVersionNo: row.latestVersionNo,
    updatedBy: null,
    updatedAt: null,
  };
}
