import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { detail, execContent, publishedProcedure, startRun } from "../../../test/executions.ts";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { procedures, procedureVersions } from "../../db/schema/procedures.ts";
import { userRoles } from "../../db/schema/users.ts";

beforeEach(resetDb);

async function people() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  const executorId = await createUser({ username: "exec01", role: "worker" });
  await createUser({ username: "viewer01", role: "viewer" });
  await createUser({ username: "admin01", role: "admin" });
  return {
    authorId,
    executorId,
    executor: await login("exec01"),
    viewer: await login("viewer01"),
    admin: await login("admin01"),
  };
}

describe("GET /api/executions/:id", () => {
  it("F-05: 実行の詳細を誰でも見られ、他のユーザーは id と name だけ", async () => {
    const { authorId, executorId, executor, viewer } = await people();
    const id = await startRun(executor, await publishedProcedure(authorId));
    const d = await detail(viewer, id);
    expect(d.executor).toEqual({ id: executorId, name: "exec01 さん" });
    expect(Object.keys(d.executor)).toEqual(["id", "name"]);
    expect(d.procedure.title).toBe("nginx の設定変更");
    expect(d.cancelledBy).toBeNull();
    expect(d.approvals).toEqual([]);
  });

  it("D-48: canAdminCancel は管理者にだけ返す", async () => {
    const { authorId, executorId, executor, viewer, admin } = await people();
    const id = await startRun(executor, await publishedProcedure(authorId));

    expect("canAdminCancel" in (await detail(viewer, id))).toBe(false);
    expect("canAdminCancel" in (await detail(executor, id))).toBe(false);
    expect((await detail(admin, id)).canAdminCancel).toBe(false);

    await db.delete(userRoles).where(eq(userRoles.userId, executorId));
    expect((await detail(admin, id)).canAdminCancel).toBe(true);
  });

  it("F-05: 後から新しい版が公開されても、実行の文書とタイトルは開始時の版のまま", async () => {
    const { authorId, executor, viewer } = await people();
    const procedureId = await publishedProcedure(authorId);
    const id = await startRun(executor, procedureId);

    await db.insert(procedureVersions).values({
      procedureId,
      versionNo: 2,
      content: execContent({ title: "nginx の設定変更（改訂）" }),
      changeReason: "改訂",
      publishedBy: authorId,
    });
    await db.update(procedures).set({ latestVersionNo: 2 }).where(eq(procedures.id, procedureId));

    const d = await detail(viewer, id);
    expect(d.versionNo).toBe(1);
    expect(d.procedure.title).toBe("nginx の設定変更");
    expect(d.content.title).toBe("nginx の設定変更");
  });

  it("存在しない ID・不正な ID は NOT_FOUND", async () => {
    const { viewer } = await people();
    const unknown = await request("/api/executions/01970000-0000-7000-8000-000000000000", {
      cookie: viewer,
    });
    expect(unknown.status).toBe(404);
    const bad = await request("/api/executions/not-a-uuid", { cookie: viewer });
    expect(bad.status).toBe(404);
  });
});

describe("GET /api/executions", () => {
  const change = (cookie: string, id: string, stepId: string, to: string) =>
    request(`/api/executions/${id}/steps/${stepId}/status-changes`, {
      cookie,
      json: { from: "pending", to, skipReason: to === "skipped" ? "対象外" : null },
    });

  it("F-07: 一覧に手順書名・版・実行者・状態・進捗・開始・最終更新・承認状態が出る", async () => {
    const { authorId, executorId, executor, viewer } = await people();
    const content = execContent();
    content.steps = [
      ...content.steps.map((s) => ({ ...s, evidenceRequired: false })),
      { ...content.steps[0], id: crypto.randomUUID(), title: "追加1" },
      { ...content.steps[0], id: crypto.randomUUID(), title: "追加2" },
    ] as typeof content.steps;
    const procedureId = await publishedProcedure(authorId, content);
    const id = await startRun(executor, procedureId);
    const d = await detail(executor, id);
    const main = d.steps.filter((s: { section: string }) => s.section === "main");
    const rollback = d.steps.filter((s: { section: string }) => s.section === "rollback");
    // 完了2・スキップ1・失敗1・未実施1、切り戻しの完了1
    for (const [i, to] of ["done", "done", "skipped", "failed"].entries()) {
      expect((await change(executor, id, main[i].stepId, to)).status).toBe(204);
    }
    expect((await change(executor, id, rollback[0].stepId, "done")).status).toBe(204);

    const res = await request("/api/executions", { cookie: viewer });
    expect(res.status).toBe(200);
    const { executions } = await readJson(res);
    expect(executions).toHaveLength(1);
    const after = await detail(viewer, id);
    expect(executions[0]).toEqual({
      id,
      procedure: { id: procedureId, title: "nginx の設定変更" },
      versionNo: 1,
      executor: { id: executorId, name: "exec01 さん" },
      status: "running",
      approvalStatus: null,
      progress: { done: 3, total: 5 },
      startedAt: after.startedAt,
      updatedAt: after.updatedAt,
    });
  });

  it("D-49: 一覧の実行者は id と name だけ", async () => {
    const { authorId, executor, viewer } = await people();
    await startRun(executor, await publishedProcedure(authorId));
    const { executions } = await readJson(await request("/api/executions", { cookie: viewer }));
    expect(Object.keys(executions[0].executor)).toEqual(["id", "name"]);
  });

  it("実行が0件なら空の配列", async () => {
    const { viewer } = await people();
    const { executions } = await readJson(await request("/api/executions", { cookie: viewer }));
    expect(executions).toEqual([]);
  });
});
