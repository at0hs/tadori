import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_VALUES, detail, publishedProcedure, startRun } from "../../../test/executions.ts";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { db } from "../../db/client.ts";
import { executions } from "../../db/schema/executions.ts";

beforeEach(resetDb);

async function setup() {
  const authorId = await createUser({ username: "author01", roles: ["author"] });
  const executorId = await createUser({ username: "exec01", roles: ["executor"] });
  await createUser({ username: "exec02", roles: ["executor"] });
  const executor = await login("exec01");
  const id = await startRun(executor, await publishedProcedure(authorId));
  const d = await detail(executor, id);
  const stepIds: string[] = d.steps.map((s: { stepId: string }) => s.stepId);
  return { executorId, executor, other: await login("exec02"), id, stepIds };
}

const change = (
  cookie: string,
  id: string,
  stepId: string,
  from: string,
  to: string,
  skipReason: string | null = null,
) =>
  request(`/api/executions/${id}/steps/${stepId}/status-changes`, {
    cookie,
    json: { from, to, skipReason },
  });

const comment = (cookie: string, id: string, stepId: string, body: string) =>
  request(`/api/executions/${id}/steps/${stepId}/comments`, { cookie, json: { body } });

const evidence = (cookie: string, id: string, stepId: string, body: string) =>
  request(`/api/executions/${id}/steps/${stepId}/evidences`, { cookie, json: { body } });

const putVariables = (cookie: string, id: string, variables: Record<string, string>) =>
  request(`/api/executions/${id}/variables`, { cookie, method: "PUT", json: { variables } });

describe("ステップの状態", () => {
  it("F-06 AC: 状態変更の履歴（誰が・いつ・何から何に）が残る", async () => {
    const { executorId, executor, id, stepIds } = await setup();
    const s = stepIds[0] as string;
    expect((await change(executor, id, s, "pending", "failed")).status).toBe(204);
    expect((await change(executor, id, s, "failed", "done")).status).toBe(204);

    const step = (await detail(executor, id)).steps[0];
    expect(step.status).toBe("done");
    expect(step.updatedBy).toEqual({ id: executorId, name: "exec01 さん" });
    expect(step.updatedAt).not.toBeNull();
    expect(step.history).toHaveLength(2);
    expect(step.history[0]).toMatchObject({
      from: "pending",
      to: "failed",
      skipReason: null,
      changedBy: { id: executorId, name: "exec01 さん" },
    });
    expect(step.history[1]).toMatchObject({ from: "failed", to: "done" });
    expect(typeof step.history[0].changedAt).toBe("string");
  });

  it("F-06 AC: エビデンス必須のステップを、エビデンスなしで完了にするとエラー", async () => {
    const { executor, id, stepIds } = await setup();
    const s = stepIds[1] as string;
    const res = await change(executor, id, s, "pending", "done");
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
    expect((await detail(executor, id)).steps[1].status).toBe("pending");

    expect((await evidence(executor, id, s, "Active: active (running)")).status).toBe(204);
    expect((await change(executor, id, s, "pending", "done")).status).toBe(204);
  });

  it("F-06: スキップには理由が必要で、ほかの状態にすると理由は消え、履歴には残る", async () => {
    const { executor, id, stepIds } = await setup();
    const s = stepIds[0] as string;
    const noReason = await change(executor, id, s, "pending", "skipped", null);
    expect(noReason.status).toBe(400);

    expect((await change(executor, id, s, "pending", "skipped", "対象外のため")).status).toBe(204);
    expect((await detail(executor, id)).steps[0].skipReason).toBe("対象外のため");

    expect((await change(executor, id, s, "skipped", "done")).status).toBe(204);
    const step = (await detail(executor, id)).steps[0];
    expect(step.skipReason).toBeNull();
    expect(step.history[0].skipReason).toBe("対象外のため");
    expect(step.history[1].skipReason).toBeNull();
  });

  it("F-05 AC: 実行者以外はステップの状態を変更できない", async () => {
    const { executor, other, id, stepIds } = await setup();
    const res = await change(other, id, stepIds[0] as string, "pending", "done");
    expect(res.status).toBe(403);
    expect((await detail(executor, id)).steps[0].status).toBe("pending");
  });

  it("D-46: 画面が見ていた状態と違えば STEP_STATUS_CONFLICT", async () => {
    const { executorId, executor, id, stepIds } = await setup();
    const s = stepIds[0] as string;
    expect((await change(executor, id, s, "pending", "done")).status).toBe(204);
    const res = await change(executor, id, s, "pending", "failed");
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.code).toBe("STEP_STATUS_CONFLICT");
    expect(body.stepId).toBe(s);
    expect(body.currentStatus).toBe("done");
    expect(body.updatedBy).toEqual({ id: executorId, name: "exec01 さん" });
    expect(typeof body.updatedAt).toBe("string");
    expect((await detail(executor, id)).steps[0].history).toHaveLength(1);
  });

  it("存在しないステップは NOT_FOUND", async () => {
    const { executor, id } = await setup();
    const unknown = "01970000-0000-7000-8000-000000000000";
    expect((await change(executor, id, unknown, "pending", "done")).status).toBe(404);
    expect((await comment(executor, id, unknown, "メモ")).status).toBe(404);
    expect((await evidence(executor, id, unknown, "出力")).status).toBe(404);
  });
});

describe("変数", () => {
  it("F-04: 最初のステップの状態を変えるまでは変数を直せ、その後は直せない", async () => {
    const { executor, id, stepIds } = await setup();
    const next = { host: "web02.example.test", port: "2222" };
    expect((await putVariables(executor, id, next)).status).toBe(204);
    expect((await detail(executor, id)).variables).toEqual(next);

    const s = stepIds[0] as string;
    expect((await change(executor, id, s, "pending", "done")).status).toBe(204);
    expect((await detail(executor, id)).variablesLocked).toBe(true);
    expect((await putVariables(executor, id, DEFAULT_VALUES)).status).toBe(409);

    // pending に戻してもロックは外れない（D-04）
    expect((await change(executor, id, s, "done", "pending")).status).toBe(204);
    const res = await putVariables(executor, id, DEFAULT_VALUES);
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
    expect((await detail(executor, id)).variables).toEqual(next);
  });

  it("D-01: 変数の変更でも秘密変数の値は受け取らない", async () => {
    const { executor, id } = await setup();
    const res = await putVariables(executor, id, {
      ...DEFAULT_VALUES,
      admin_password: "Dummy-Pass-123",
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).errors[0].path).toBe("variables.admin_password");
  });

  it("実行者以外は変数を直せない", async () => {
    const { other, id } = await setup();
    expect((await putVariables(other, id, DEFAULT_VALUES)).status).toBe(403);
  });
});

describe("コメント・エビデンス", () => {
  it("D-25: コメント・エビデンスは何件でも追加でき、本文はそのまま返る", async () => {
    const { executor, id, stepIds } = await setup();
    const s = stepIds[0] as string;
    expect((await comment(executor, id, s, "1つ目")).status).toBe(204);
    expect((await comment(executor, id, s, "token ●●●● を使った")).status).toBe(204);
    expect((await evidence(executor, id, s, "  out ●●●●\n")).status).toBe(204);
    expect((await evidence(executor, id, s, "2つ目")).status).toBe(204);

    const step = (await detail(executor, id)).steps[0];
    expect(step.comments.map((c: { body: string }) => c.body)).toEqual([
      "1つ目",
      "token ●●●● を使った",
    ]);
    expect(step.evidences.map((c: { body: string }) => c.body)).toEqual(["  out ●●●●\n", "2つ目"]);
    expect(step.comments[0].createdBy.name).toBe("exec01 さん");
  });

  it("実行者以外はコメント・エビデンスを足せない", async () => {
    const { other, id, stepIds } = await setup();
    expect((await comment(other, id, stepIds[0] as string, "メモ")).status).toBe(403);
    expect((await evidence(other, id, stepIds[0] as string, "出力")).status).toBe(403);
  });
});

describe("終了した実行", () => {
  it("終了した実行には状態の変更・コメント・エビデンスを足せない", async () => {
    const { executor, id, stepIds } = await setup();
    const s = stepIds[0] as string;
    await db
      .update(executions)
      .set({ status: "completed", endedAt: new Date(), approvalStatus: "pending" })
      .where(eq(executions.id, id));
    expect((await change(executor, id, s, "pending", "done")).status).toBe(409);
    expect((await comment(executor, id, s, "メモ")).status).toBe(409);
    expect((await evidence(executor, id, s, "出力")).status).toBe(409);
    expect((await putVariables(executor, id, DEFAULT_VALUES)).status).toBe(409);

    // 差し戻しの後は、コメントとエビデンスだけを足せる
    await db.update(executions).set({ approvalStatus: "rejected" }).where(eq(executions.id, id));
    expect((await comment(executor, id, s, "メモ")).status).toBe(204);
    expect((await evidence(executor, id, s, "出力")).status).toBe(204);
    expect((await change(executor, id, s, "pending", "done")).status).toBe(409);
  });
});

it("書き込みのたびに updatedAt が進む", async () => {
  const { executor, id, stepIds } = await setup();
  const s = stepIds[0] as string;
  let last = (await detail(executor, id)).updatedAt as string;
  const ops = [
    () => putVariables(executor, id, DEFAULT_VALUES),
    () => change(executor, id, s, "pending", "done"),
    () => comment(executor, id, s, "メモ"),
    () => evidence(executor, id, s, "出力"),
  ];
  for (const op of ops) {
    expect((await op()).status).toBe(204);
    const now = (await detail(executor, id)).updatedAt as string;
    expect(new Date(now).getTime()).toBeGreaterThan(new Date(last).getTime());
    last = now;
  }
});
