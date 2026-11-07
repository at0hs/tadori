import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { execContent, publishedProcedure, startRun } from "../../../test/executions.ts";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { insertProcedure, sampleContent } from "../../../test/procedures.ts";
import { db } from "../../db/client.ts";
import { executions } from "../../db/schema/executions.ts";
import { procedureDrafts } from "../../db/schema/procedures.ts";

beforeEach(resetDb);

async function home(cookie: string) {
  const res = await request("/api/me/home", { cookie });
  expect(res.status).toBe(200);
  return readJson(res);
}

/** 実行の状態・承認状態・日時を DB に直接入れる。 */
async function setRun(id: string, values: Partial<typeof executions.$inferInsert>): Promise<void> {
  await db.update(executions).set(values).where(eq(executions.id, id));
}

const at = (s: string) => new Date(`2026-11-0${s}T00:00:00.000Z`);

describe("GET /api/me/home", () => {
  it("ロールのない区画は返さない", async () => {
    await createUser({ username: "viewer01", roles: ["viewer"] });
    await createUser({ username: "exec01", roles: ["executor"] });
    await createUser({ username: "both01", roles: ["author", "approver"] });
    expect(await home(await login("viewer01"))).toEqual({});
    expect(Object.keys(await home(await login("exec01")))).toEqual(["myExecutions"]);
    expect(Object.keys(await home(await login("both01"))).sort()).toEqual([
      "drafts",
      "pendingApprovals",
    ]);
  });

  it("自分の実行は、実行中か差し戻しの自分の実行だけを最終更新の新しい順に返す", async () => {
    const authorId = await createUser({ username: "author01", roles: ["author"] });
    await createUser({ username: "exec01", roles: ["executor"] });
    await createUser({ username: "exec02", roles: ["executor"] });
    const me = await login("exec01");
    const other = await login("exec02");
    const procedureId = await publishedProcedure(authorId);

    const running = await startRun(me, procedureId);
    const rejected = await startRun(me, procedureId);
    const pending = await startRun(me, procedureId);
    const completed = await startRun(me, procedureId);
    const othersRunning = await startRun(other, procedureId);
    const done = { status: "completed" as const, endedAt: at("2") };
    await setRun(running, { updatedAt: at("3") });
    await setRun(rejected, { ...done, approvalStatus: "rejected", updatedAt: at("4") });
    await setRun(pending, { ...done, approvalStatus: "pending", updatedAt: at("5") });
    await setRun(completed, { ...done, updatedAt: at("6") });
    await setRun(othersRunning, { updatedAt: at("7") });

    const body = await home(me);
    expect(body.myExecutions.map((e: { id: string }) => e.id)).toEqual([rejected, running]);

    // 進捗などは S-11 の一覧と同じ値
    const list = await readJson(await request("/api/executions", { cookie: me }));
    const inList = list.executions.find((e: { id: string }) => e.id === running);
    const inHome = body.myExecutions.find((e: { id: string }) => e.id === running);
    expect(inHome).toEqual({ ...inList, endedAt: null });
    expect(inHome.progress).toEqual({ done: 0, total: 3 });
  });

  it("承認待ちは、実行者が自分でないものだけを終了日時の古い順に返す", async () => {
    const authorId = await createUser({ username: "author01", roles: ["author"] });
    await createUser({ username: "both01", roles: ["executor", "approver"] });
    await createUser({ username: "exec02", roles: ["executor"] });
    const me = await login("both01");
    const other = await login("exec02");
    const procedureId = await publishedProcedure(authorId);

    const mine = await startRun(me, procedureId);
    const newer = await startRun(other, procedureId);
    const older = await startRun(other, procedureId);
    const rejected = await startRun(other, procedureId);
    const pending = { status: "completed" as const, approvalStatus: "pending" as const };
    await setRun(mine, { ...pending, endedAt: at("1") });
    await setRun(newer, { ...pending, endedAt: at("4") });
    await setRun(older, { status: "abnormal", approvalStatus: "pending", endedAt: at("2") });
    await setRun(rejected, { ...pending, approvalStatus: "rejected", endedAt: at("1") });

    const body = await home(me);
    expect(body.pendingApprovals.map((e: { id: string }) => e.id)).toEqual([older, newer]);
    expect(body.pendingApprovals[0].endedAt).toBe(at("2").toISOString());
    // 自分の承認待ちは自分の実行にも出ない
    expect(body.myExecutions).toEqual([]);
  });

  it("編集中の手順書は、下書きのある手順書（未公開を含む）を最終更新の新しい順に返す", async () => {
    const authorId = await createUser({ username: "author01", roles: ["author"] });
    const otherId = await createUser({ username: "author02", roles: ["author"] });
    const me = await login("author01");

    const editing = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "公開済みの題" })],
      draft: sampleContent({ title: "下書きの題" }),
      draftBy: otherId,
    });
    const unpublished = await insertProcedure({
      createdBy: authorId,
      draft: sampleContent({ title: "未公開の題" }),
    });
    await publishedProcedure(authorId, execContent());
    await db
      .update(procedureDrafts)
      .set({ updatedAt: at("3") })
      .where(eq(procedureDrafts.procedureId, editing));
    await db
      .update(procedureDrafts)
      .set({ updatedAt: at("5") })
      .where(eq(procedureDrafts.procedureId, unpublished));

    const body = await home(me);
    expect(body.drafts).toEqual([
      {
        id: unpublished,
        title: "未公開の題",
        status: "unpublished",
        updatedBy: { id: authorId, name: "author01 さん" },
        updatedAt: at("5").toISOString(),
      },
      {
        id: editing,
        title: "下書きの題",
        status: "editing",
        updatedBy: { id: otherId, name: "author02 さん" },
        updatedAt: at("3").toISOString(),
      },
    ]);
  });

  it("パスワード変更が必要な人は呼べない", async () => {
    await createUser({ username: "exec01", roles: ["executor"], mustChangePassword: true });
    const res = await request("/api/me/home", { cookie: await login("exec01") });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});
