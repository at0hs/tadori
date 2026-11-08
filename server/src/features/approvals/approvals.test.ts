import { newId } from "@tadori/shared";
import { and, eq } from "drizzle-orm";
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
import { approvalEvents, executions } from "../../db/schema/executions.ts";
import { userRoles } from "../../db/schema/users.ts";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const change = (cookie: string, id: string, stepId: string, from: string, to: string) =>
  request(`/api/executions/${id}/steps/${stepId}/status-changes`, {
    cookie,
    json: { from, to, skipReason: to === "skipped" ? "対象外" : null },
  });
const finish = (cookie: string, id: string) =>
  request(`/api/executions/${id}/finish`, { cookie, method: "POST" });
const approve = (cookie: string, id: string) =>
  request(`/api/executions/${id}/approve`, { cookie, method: "POST" });
const reject = (cookie: string, id: string, comment = "証跡が足りません") =>
  request(`/api/executions/${id}/reject`, { cookie, json: { comment } });
const resubmit = (cookie: string, id: string, comment = "証跡を足しました") =>
  request(`/api/executions/${id}/resubmit`, { cookie, json: { comment } });
const comment = (cookie: string, id: string, stepId: string) =>
  request(`/api/executions/${id}/steps/${stepId}/comments`, { cookie, json: { body: "追記" } });
const evidence = (cookie: string, id: string, stepId: string) =>
  request(`/api/executions/${id}/steps/${stepId}/evidences`, { cookie, json: { body: "ok" } });

const codeOf = async (res: Response) => (await readJson(res)).code;

/** 開始して、手順を完了・スキップ・完了にして終了する（承認待ちになる）。 */
async function finishedRun(cookie: string, procedureId: string) {
  const id = await startRun(cookie, procedureId);
  const d = await detail(cookie, id);
  const main: string[] = d.steps
    .filter((s: { section: string }) => s.section === "main")
    .map((s: { stepId: string }) => s.stepId);
  expect((await change(cookie, id, main[0] as string, "pending", "done")).status).toBe(204);
  expect((await change(cookie, id, main[1] as string, "pending", "skipped")).status).toBe(204);
  expect((await change(cookie, id, main[2] as string, "pending", "done")).status).toBe(204);
  expect((await finish(cookie, id)).status).toBe(200);
  return { id, main };
}

async function setup() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  const executorId = await createUser({ username: "exec01", role: "worker" });
  const approverId = await createUser({ username: "appr01", role: "approver" });
  const bothId = await createUser({ username: "both01", role: "approver" });
  await createUser({ username: "admin01", role: "admin" });
  const executor = await login("exec01");
  const procedureId = await publishedProcedure(authorId);
  const { id, main } = await finishedRun(executor, procedureId);
  return {
    executorId,
    approverId,
    bothId,
    procedureId,
    executor,
    approver: await login("appr01"),
    both: await login("both01"),
    admin: await login("admin01"),
    id,
    main,
  };
}

const rowOf = async (id: string) => {
  const [row] = await db.select().from(executions).where(eq(executions.id, id));
  return row as typeof executions.$inferSelect;
};

describe("承認・差し戻し", () => {
  it("F-08: 承認者が承認すると承認済みになり、ログを出す", async () => {
    const { approverId, approver, executor, id } = await setup();
    const before = await rowOf(id);
    const logs = captureOperationLogs();

    expect((await approve(approver, id)).status).toBe(204);

    const d = await detail(executor, id);
    expect(d.approvalStatus).toBe("approved");
    expect(d.approvals.at(-1)).toEqual({
      kind: "approved",
      comment: null,
      actor: { id: approverId, name: "appr01 さん" },
      occurredAt: expect.any(String),
    });
    const row = await rowOf(id);
    expect(row.approvalDecidedBy).toBe(approverId);
    expect(row.approvalDecidedAt).not.toBeNull();
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    const approved = logs.filter((l) => l.event === "execution.approved");
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({ target: { type: "execution", id } });
  });

  it("F-08: 差し戻すと差し戻しになり、コメントを履歴に残す（ログには出さない）", async () => {
    const { approverId, approver, executor, id } = await setup();
    const logs = captureOperationLogs();

    expect((await reject(approver, id, "  証跡が足りません  ")).status).toBe(204);

    const d = await detail(executor, id);
    expect(d.approvalStatus).toBe("rejected");
    expect(d.approvals.at(-1)).toMatchObject({
      kind: "rejected",
      comment: "証跡が足りません",
      actor: { id: approverId },
    });
    expect((await rowOf(id)).approvalDecidedBy).toBe(approverId);
    expect(logs.filter((l) => l.event === "execution.rejected")).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("証跡が足りません");
  });

  it("F-08: 差し戻しはコメントが必須", async () => {
    const { approver, executor, id } = await setup();
    const res = await reject(approver, id, "   ");
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].path).toBe("comment");
    expect((await detail(executor, id)).approvalStatus).toBe("pending");
  });

  it("F-08 AC: 自分の実行は承認・差し戻しできない", async () => {
    const { both, procedureId } = await setup();
    const { id } = await finishedRun(both, procedureId);
    const a = await approve(both, id);
    expect(a.status).toBe(403);
    expect(await codeOf(a)).toBe("FORBIDDEN");
    const r = await reject(both, id);
    expect(r.status).toBe(403);
    expect(await codeOf(r)).toBe("FORBIDDEN");
  });

  it("承認者ロールのない人は承認できない", async () => {
    const { admin, executor, id } = await setup();
    expect((await approve(admin, id)).status).toBe(403);
    expect((await approve(executor, id)).status).toBe(403);
  });

  it("承認待ちでなければ承認・差し戻しできない", async () => {
    const { executor, approver, procedureId } = await setup();
    const running = await startRun(executor, procedureId);
    expect(await codeOf(await approve(approver, running))).toBe("STATE_CONFLICT");
    const cancelled = await startRun(executor, procedureId);
    const c = await request(`/api/executions/${cancelled}/cancel`, {
      cookie: executor,
      json: { reason: "" },
    });
    expect(c.status).toBe(204);
    expect(await codeOf(await approve(approver, cancelled))).toBe("STATE_CONFLICT");
    expect(await codeOf(await reject(approver, cancelled))).toBe("STATE_CONFLICT");
  });

  it("同時に承認しても1件だけが通る", async () => {
    const { approver, both, id } = await setup();
    const results = await Promise.all([approve(approver, id), reject(both, id)]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    const decided = await db
      .select()
      .from(approvalEvents)
      .where(and(eq(approvalEvents.executionId, id)));
    expect(decided.filter((e) => e.kind !== "requested")).toHaveLength(1);
  });

  it("存在しない実行は NOT_FOUND", async () => {
    const { approver } = await setup();
    expect((await approve(approver, newId())).status).toBe(404);
  });
});

describe("差し戻し後と再依頼", () => {
  it("差し戻し後：本人はコメントとエビデンスを追加できるが、状態は変えられない", async () => {
    const { approver, executor, id, main } = await setup();
    expect((await reject(approver, id)).status).toBe(204);
    expect((await comment(executor, id, main[0] as string)).status).toBe(204);
    expect((await evidence(executor, id, main[0] as string)).status).toBe(204);
    const res = await change(executor, id, main[0] as string, "done", "failed");
    expect(await codeOf(res)).toBe("STATE_CONFLICT");
  });

  it("F-08: 本人が再依頼すると承認待ちに戻り、追記できなくなる", async () => {
    const { approverId, executorId, approver, executor, id, main } = await setup();
    expect((await reject(approver, id)).status).toBe(204);
    const logs = captureOperationLogs();

    expect((await resubmit(executor, id, "証跡を足しました")).status).toBe(204);

    const d = await detail(executor, id);
    expect(d.approvalStatus).toBe("pending");
    expect(d.approvals.at(-1)).toMatchObject({
      kind: "requested",
      comment: "証跡を足しました",
      actor: { id: executorId },
    });
    expect((await rowOf(id)).approvalDecidedBy).toBe(approverId);
    expect(await codeOf(await comment(executor, id, main[0] as string))).toBe("STATE_CONFLICT");
    expect(logs).toHaveLength(0);
  });

  it("再依頼はコメントが必須で、差し戻しのときだけできる", async () => {
    const { approver, executor, id } = await setup();
    expect(await codeOf(await resubmit(executor, id))).toBe("STATE_CONFLICT");
    expect((await reject(approver, id)).status).toBe(204);
    const res = await resubmit(executor, id, "  ");
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("VALIDATION_FAILED");
  });

  it("D-35: 本人以外と、実行者ロールを外された本人は再依頼できない", async () => {
    const { executorId, approver, both, executor, id } = await setup();
    expect((await reject(approver, id)).status).toBe(204);
    expect((await resubmit(approver, id)).status).toBe(403);
    const b = await resubmit(both, id);
    expect(b.status).toBe(403);
    expect(await codeOf(b)).toBe("FORBIDDEN");
    await db.delete(userRoles).where(eq(userRoles.userId, executorId));
    expect((await resubmit(executor, id)).status).toBe(403);
  });

  it("F-08 AC: 承認済みの実行には、誰も追記・変更できない", async () => {
    const { approver, both, executor, id, main } = await setup();
    expect((await approve(approver, id)).status).toBe(204);
    const step = main[0] as string;
    expect(await codeOf(await comment(executor, id, step))).toBe("STATE_CONFLICT");
    expect(await codeOf(await evidence(executor, id, step))).toBe("STATE_CONFLICT");
    expect(await codeOf(await change(executor, id, step, "done", "failed"))).toBe("STATE_CONFLICT");
    expect(await codeOf(await resubmit(executor, id))).toBe("STATE_CONFLICT");
    expect(await codeOf(await reject(both, id))).toBe("STATE_CONFLICT");
    expect(await codeOf(await approve(both, id))).toBe("STATE_CONFLICT");
  });
});
