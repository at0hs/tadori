import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { detail, execContent, publishedProcedure, startRun } from "../../../test/executions.ts";
import { createUser, login, request, resetDb } from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { procedures, procedureVersions } from "../../db/schema/procedures.ts";
import { userRoles } from "../../db/schema/users.ts";

beforeEach(resetDb);

async function people() {
  const authorId = await createUser({ username: "author01", roles: ["author"] });
  const executorId = await createUser({ username: "exec01", roles: ["executor"] });
  await createUser({ username: "viewer01", roles: ["viewer"] });
  await createUser({ username: "admin01", roles: ["admin"] });
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
