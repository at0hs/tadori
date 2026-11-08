import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detail, publishedProcedure, startRun } from "../../../test/executions.ts";
import {
  captureOperationLogs,
  createUser,
  login,
  readJson,
  request,
  resetDb,
} from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  const executorId = await createUser({ username: "exec01", role: "worker" });
  const adminId = await createUser({ username: "admin01", role: "admin" });
  const executor = await login("exec01");
  const id = await startRun(executor, await publishedProcedure(authorId));
  const d = await detail(executor, id);
  const main: string[] = d.steps
    .filter((s: { section: string }) => s.section === "main")
    .map((s: { stepId: string }) => s.stepId);
  const rollback: string[] = d.steps
    .filter((s: { section: string }) => s.section === "rollback")
    .map((s: { stepId: string }) => s.stepId);
  return { executorId, adminId, executor, admin: await login("admin01"), id, main, rollback };
}

const change = (cookie: string, id: string, stepId: string, from: string, to: string) =>
  request(`/api/executions/${id}/steps/${stepId}/status-changes`, {
    cookie,
    json: { from, to, skipReason: to === "skipped" ? "対象外" : null },
  });

const finish = (cookie: string, id: string) =>
  request(`/api/executions/${id}/finish`, { cookie, method: "POST" });

const cancel = (cookie: string, id: string, reason = "") =>
  request(`/api/executions/${id}/cancel`, { cookie, json: { reason } });

/** 手順を完了・スキップ・完了にする（2つ目はエビデンス必須なのでスキップ）。 */
async function completeMain(cookie: string, id: string, main: string[]) {
  expect((await change(cookie, id, main[0] as string, "pending", "done")).status).toBe(204);
  expect((await change(cookie, id, main[1] as string, "pending", "skipped")).status).toBe(204);
  expect((await change(cookie, id, main[2] as string, "pending", "done")).status).toBe(204);
}

const revokeExecutor = (userId: string) => db.delete(userRoles).where(eq(userRoles.userId, userId));

describe("終了", () => {
  it("4.1: 手順がすべて完了かスキップなら完了で終わり、承認待ちになる", async () => {
    const { executorId, executor, id, main } = await setup();
    await completeMain(executor, id, main);
    const logs = captureOperationLogs();

    const res = await finish(executor, id);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ status: "completed" });

    const d = await detail(executor, id);
    expect(d.status).toBe("completed");
    expect(d.approvalStatus).toBe("pending");
    expect(d.endedAt).not.toBeNull();
    expect(d.approvals).toHaveLength(1);
    expect(d.approvals[0]).toMatchObject({
      kind: "requested",
      comment: null,
      actor: { id: executorId, name: "exec01 さん" },
    });
    expect(logs.find((l) => l.event === "execution.finished")).toMatchObject({
      target: { type: "execution", id },
      status: "completed",
    });
  });

  it("4.1: 失敗したステップがあれば異常終了", async () => {
    const { executor, id, main } = await setup();
    await change(executor, id, main[0] as string, "pending", "failed");
    const res = await finish(executor, id);
    expect(await readJson(res)).toEqual({ status: "abnormal" });
    expect((await detail(executor, id)).status).toBe("abnormal");
  });

  it("4.1: 切り戻しを実施していれば異常終了", async () => {
    const { executor, id, main, rollback } = await setup();
    await completeMain(executor, id, main);
    await change(executor, id, rollback[0] as string, "pending", "done");
    expect(await readJson(await finish(executor, id))).toEqual({ status: "abnormal" });
  });

  it("4.1: どちらにも当てはまらなければ終了できない", async () => {
    const { executor, id, main } = await setup();
    await change(executor, id, main[0] as string, "pending", "done");
    const res = await finish(executor, id);
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
    const d = await detail(executor, id);
    expect(d.status).toBe("running");
    expect(d.approvals).toEqual([]);
  });

  it("D-04: 最後のステップを完了にしても自動では終了しない", async () => {
    const { executor, id, main } = await setup();
    await completeMain(executor, id, main);
    expect((await detail(executor, id)).status).toBe("running");
  });

  it("終了した実行のステップは変更できない", async () => {
    const { executor, id, main } = await setup();
    await completeMain(executor, id, main);
    await finish(executor, id);
    const res = await change(executor, id, main[0] as string, "done", "failed");
    expect(res.status).toBe(409);
  });

  it("実行者本人でなければ終了できない", async () => {
    const { executor, id, main } = await setup();
    await completeMain(executor, id, main);
    await createUser({ username: "exec02", role: "worker" });
    expect((await finish(await login("exec02"), id)).status).toBe(403);
  });
});

describe("中止", () => {
  it("F-05: 実行者は理由なしで中止でき、操作ログに理由を出さない", async () => {
    const { executorId, executor, id } = await setup();
    expect((await cancel(executor, id)).status).toBe(204);
    const d = await detail(executor, id);
    expect(d.status).toBe("cancelled");
    expect(d.cancelledBy).toEqual({ id: executorId, name: "exec01 さん" });
    expect(d.cancelReason).toBeNull();
    expect(d.approvalStatus).toBeNull();
    expect(d.endedAt).not.toBeNull();
  });

  it("F-05: 実行者の中止の理由は記録に残り、操作ログには出さない", async () => {
    const { executor, id } = await setup();
    const logs = captureOperationLogs();
    const reason = "Dummy-Pass-123 を使えなかった";
    expect((await cancel(executor, id, reason)).status).toBe(204);
    expect((await detail(executor, id)).cancelReason).toBe(reason);
    const log = logs.find((l) => l.event === "execution.cancelled");
    expect(log).toMatchObject({ target: { type: "execution", id }, by: "executor" });
    expect(JSON.stringify(logs)).not.toContain("Dummy-Pass-123");
  });

  it("D-35: 実行者ロールを剥奪された実行者は、自分の実行を操作できない", async () => {
    const { executorId, executor, id, main } = await setup();
    await revokeExecutor(executorId);
    expect((await change(executor, id, main[0] as string, "pending", "done")).status).toBe(403);
    expect((await cancel(executor, id)).status).toBe(403);
    expect((await finish(executor, id)).status).toBe(403);
  });

  it("D-36: 実行者が操作できる間は、管理者は中止できない", async () => {
    const { admin, executor, id } = await setup();
    expect((await cancel(admin, id, "作業者不在のため")).status).toBe(403);
    expect((await detail(executor, id)).status).toBe("running");
  });

  it("D-36: 実行者ロールを剥奪されたら、管理者が理由を入力して中止できる", async () => {
    const { executorId, adminId, admin, id } = await setup();
    await revokeExecutor(executorId);

    const empty = await cancel(admin, id, "  ");
    expect(empty.status).toBe(400);
    expect((await readJson(empty)).errors).toEqual([
      { path: "reason", message: "中止の理由を入力してください。" },
    ]);

    const logs = captureOperationLogs();
    expect((await cancel(admin, id, "作業者不在のため")).status).toBe(204);
    const d = await detail(admin, id);
    expect(d.status).toBe("cancelled");
    expect(d.cancelledBy).toEqual({ id: adminId, name: "admin01 さん" });
    expect(d.cancelReason).toBe("作業者不在のため");
    expect(d.canAdminCancel).toBe(false);
    expect(logs.find((l) => l.event === "execution.cancelled")).toMatchObject({
      actorId: adminId,
      by: "admin",
      reason: "作業者不在のため",
    });
  });

  it("D-36: 実行者が無効化されたら、管理者が中止できる", async () => {
    const { executorId, admin, id } = await setup();
    await db.update(user).set({ banned: true }).where(eq(user.id, executorId));
    expect((await detail(admin, id)).canAdminCancel).toBe(true);
    expect((await cancel(admin, id, "退職のため")).status).toBe(204);
  });

  it("中止・終了した実行は、もう一度中止・終了できない", async () => {
    const { executor, id, main } = await setup();
    expect((await cancel(executor, id)).status).toBe(204);
    expect((await cancel(executor, id)).status).toBe(409);
    expect((await finish(executor, id)).status).toBe(409);

    const id2 = await startRun(executor, (await detail(executor, id)).procedure.id);
    const d2 = await detail(executor, id2);
    const main2 = d2.steps
      .filter((s: { section: string }) => s.section === "main")
      .map((s: { stepId: string }) => s.stepId);
    expect(main2).toEqual(main);
    await completeMain(executor, id2, main2);
    expect((await finish(executor, id2)).status).toBe(200);
    expect((await finish(executor, id2)).status).toBe(409);
    expect((await cancel(executor, id2)).status).toBe(409);
  });
});
