import {
  type DraftConflict,
  type DraftLock,
  findPublishErrors,
  type ProcedureContent,
  type SaveDraftResponse,
} from "@tadori/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { procedureDrafts, procedures, procedureVersions } from "../../db/schema/procedures.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";
import {
  type DraftRow,
  draftsOf,
  findProcedure,
  latestVersionsOf,
  type ProcedureRow,
  type Tx,
  userNames,
} from "./queries.ts";

// 手順書の作成・保存・公開・破棄・アーカイブ（state-transitions.md 2.2、api.md 4.3）。
// 作成者ロールの確認はルートで済んでいる。どの操作も、最初に procedures の行をロックする（conventions.md 4.2）。
// 文書は jsonBody で保存時の検証（procedureContentSchema）に通ったものだけが来る。

/** 手順書の行をロックし、編集できる状態かを確かめる。 */
async function lockActive(tx: Tx, id: string): Promise<ProcedureRow> {
  const row = await findProcedure(tx, id, { forUpdate: true });
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status === "archived") {
    throw new AppError("STATE_CONFLICT", "アーカイブした手順書は編集できません。");
  }
  return row;
}

/** 楽観ロックの失敗（D-05、D-28、D-55）。誰がいつ先に保存・公開したかを付ける（conventions.md 3.1）。 */
function draftConflict(detail: string, extra: DraftConflict) {
  return new AppError("DRAFT_CONFLICT", detail, extra);
}

/** 他の人が下書きを保存していた。 */
async function draftSaved(tx: Tx, draft: DraftRow) {
  const name = await userNames(tx, [draft.updatedBy]);
  return draftConflict("他のユーザーが先に下書きを保存しました。", {
    reason: "draft_saved",
    updatedBy: name(draft.updatedBy),
    updatedAt: draft.updatedAt.toISOString(),
  });
}

/** 他の人が新しい版を公開していた。 */
async function versionPublished(tx: Tx, row: ProcedureRow) {
  const version = (await latestVersionsOf(tx, [row.id])).get(row.id);
  const name = await userNames(tx, version ? [version.publishedBy] : []);
  return draftConflict("他のユーザーが先に新しい版を公開しました。", {
    reason: "version_published",
    updatedBy: version ? name(version.publishedBy) : null,
    updatedAt: version?.publishedAt.toISOString() ?? null,
  });
}

/**
 * 読み込んだ時点の状態と今の状態を照合する（D-05、D-28、D-55）。合えば今の下書きを返す。
 * - 下書きがあった：今も下書きがあり、revision が同じ
 * - 下書きがなかった：今も下書きがなく、最新の版数が読み込んだ版数と同じ
 */
async function checkLock(tx: Tx, row: ProcedureRow, lock: DraftLock) {
  const draft = (await draftsOf(tx, [row.id])).get(row.id);
  if (lock.revision !== null) {
    if (draft && draft.revision === lock.revision) return draft;
    if (draft) throw await draftSaved(tx, draft);
    // 下書きが消えている。破棄されたのか、公開されたのかは見分けない
    throw draftConflict("下書きが破棄されているか、公開されています。", {
      reason: "draft_discarded",
      updatedBy: null,
      updatedAt: null,
    });
  }
  if (draft) throw await draftSaved(tx, draft);
  if (row.latestVersionNo !== lock.versionNo) throw await versionPublished(tx, row);
  return undefined;
}

/** 手順書を作成する（最初の保存）。下書き（revision = 1）ができる。 */
export async function createProcedure(
  op: Operator,
  content: ProcedureContent,
): Promise<{ id: string; revision: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(procedures)
      .values({ createdBy: op.actor.id })
      .returning({ id: procedures.id });
    if (!row) throw new Error("手順書を作れなかった");
    await tx.insert(procedureDrafts).values({
      procedureId: row.id,
      baseVersionNo: null,
      content,
      revision: 1,
      createdBy: op.actor.id,
      updatedBy: op.actor.id,
    });
    return { id: row.id, revision: 1 };
  });
}

/** 下書きを保存する。下書きがなければ最新版を元にして作る（D-28）。 */
export async function saveDraft(
  op: Operator,
  id: string,
  content: ProcedureContent,
  lock: DraftLock,
): Promise<SaveDraftResponse> {
  const saved = await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    const draft = await checkLock(tx, row, lock);
    if (draft) {
      const [updated] = await tx
        .update(procedureDrafts)
        .set({
          content,
          revision: draft.revision + 1,
          updatedBy: op.actor.id,
          updatedAt: sql`now()`,
        })
        .where(eq(procedureDrafts.procedureId, id))
        .returning();
      return updated;
    }
    const [inserted] = await tx
      .insert(procedureDrafts)
      .values({
        procedureId: id,
        baseVersionNo: row.latestVersionNo,
        content,
        revision: 1,
        createdBy: op.actor.id,
        updatedBy: op.actor.id,
      })
      .returning();
    return inserted;
  });
  if (!saved) throw new Error("下書きを保存できなかった");
  return {
    revision: saved.revision,
    updatedBy: { id: op.actor.id, name: op.actor.name },
    updatedAt: saved.updatedAt.toISOString(),
  };
}

/** 編集画面の内容をそのまま公開する（保存と公開を1つの操作で行う、state-transitions.md 2.2）。 */
export async function publishDraft(
  op: Operator,
  id: string,
  content: ProcedureContent,
  lock: DraftLock,
  changeReason: string,
): Promise<{ versionNo: number }> {
  const versionNo = await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await checkLock(tx, row, lock);
    const errors = findPublishErrors(content);
    if (errors.length > 0) {
      // 本文の中の位置にする（conventions.md 3.1）
      throw new AppError("VALIDATION_FAILED", undefined, {
        errors: errors.map((e) => ({ ...e, path: `content.${e.path}` })),
      });
    }
    const next = (row.latestVersionNo ?? 0) + 1;
    await tx.insert(procedureVersions).values({
      procedureId: id,
      versionNo: next,
      content,
      changeReason,
      publishedBy: op.actor.id,
    });
    await tx.delete(procedureDrafts).where(eq(procedureDrafts.procedureId, id));
    await tx.update(procedures).set({ latestVersionNo: next }).where(eq(procedures.id, id));
    return next;
  });

  logOperation(
    op.meta,
    {
      event: "procedure.published",
      actorId: op.actor.id,
      target: { type: "procedure", id },
      versionNo,
    },
    "手順書を公開した",
  );
  return { versionNo };
}

/** 下書きを破棄する。未公開なら手順書ごと削除する（D-29）。 */
export async function discardDraft(
  _op: Operator,
  id: string,
  revision: number,
): Promise<{ deleted: "draft" | "procedure" }> {
  return db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await checkLock(tx, row, { revision });
    if (row.latestVersionNo === null) {
      await tx.delete(procedures).where(eq(procedures.id, id));
      return { deleted: "procedure" as const };
    }
    await tx.delete(procedureDrafts).where(eq(procedureDrafts.procedureId, id));
    return { deleted: "draft" as const };
  });
}

/** アーカイブする。下書きがあれば破棄する（D-07）。解除はできない。 */
export async function archiveProcedure(op: Operator, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await findProcedure(tx, id, { forUpdate: true });
    if (!row) throw new AppError("NOT_FOUND");
    if (row.status === "archived") {
      throw new AppError("STATE_CONFLICT", "この手順書はすでにアーカイブされています。");
    }
    if (row.latestVersionNo === null) {
      throw new AppError(
        "STATE_CONFLICT",
        "未公開の手順書はアーカイブできません。下書きを破棄してください。",
      );
    }
    await tx.delete(procedureDrafts).where(eq(procedureDrafts.procedureId, id));
    await tx
      .update(procedures)
      .set({ status: "archived", archivedBy: op.actor.id, archivedAt: sql`now()` })
      .where(eq(procedures.id, id));
  });

  logOperation(
    op.meta,
    { event: "procedure.archived", actorId: op.actor.id, target: { type: "procedure", id } },
    "手順書をアーカイブした",
  );
}
