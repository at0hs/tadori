import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VALUES,
  detail,
  execContent,
  publishedProcedure,
} from "../../../test/executions.ts";
import {
  captureOperationLogs,
  createUser,
  login,
  readJson,
  request,
  resetDb,
} from "../../../test/helpers.ts";
import { insertProcedure, sampleContent } from "../../../test/procedures.ts";
import { db } from "../../db/client.ts";
import { executions } from "../../db/schema/executions.ts";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

async function people() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  await createUser({ username: "exec01", role: "worker" });
  return { authorId, executor: await login("exec01") };
}

const start = (cookie: string, json: unknown) => request("/api/executions", { cookie, json });

describe("POST /api/executions", () => {
  it("F-05: 公開済みの手順書の最新版から実行を開始できる", async () => {
    const { authorId, executor } = await people();
    const procedureId = await publishedProcedure(authorId);
    const logs = captureOperationLogs();

    const res = await start(executor, { procedureId, versionNo: 1, variables: DEFAULT_VALUES });
    expect(res.status).toBe(201);
    const { id } = await readJson(res);

    const d = await detail(executor, id);
    expect(d.status).toBe("running");
    expect(d.versionNo).toBe(1);
    expect(d.variables).toEqual(DEFAULT_VALUES);
    expect(d.variablesLocked).toBe(false);
    expect(d.approvalStatus).toBeNull();
    expect(d.endedAt).toBeNull();
    const content = execContent();
    expect(d.steps.map((s: { section: string }) => s.section)).toEqual([
      "main",
      "main",
      "main",
      "rollback",
    ]);
    expect(d.steps.every((s: { status: string }) => s.status === "pending")).toBe(true);
    expect(d.steps.map((s: { stepId: string }) => s.stepId)).toEqual([
      ...d.content.steps.map((s: { id: string }) => s.id),
      ...d.content.rollbackSteps.map((s: { id: string }) => s.id),
    ]);
    expect(d.content.title).toBe(content.title);

    const log = logs.find((l) => l.event === "execution.started");
    expect(log).toMatchObject({
      target: { type: "execution", id },
      procedureId,
      versionNo: 1,
    });
  });

  it("F-05: 最新版でなければ NOT_LATEST_VERSION", async () => {
    const { authorId, executor } = await people();
    const procedureId = await insertProcedure({
      createdBy: authorId,
      versions: [execContent(), execContent()],
    });
    const res = await start(executor, { procedureId, versionNo: 1, variables: DEFAULT_VALUES });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.code).toBe("NOT_LATEST_VERSION");
    expect(body.latestVersionNo).toBe(2);
  });

  it("F-05: アーカイブした手順書からは開始できない", async () => {
    const { authorId, executor } = await people();
    const procedureId = await insertProcedure({
      createdBy: authorId,
      versions: [execContent()],
      archived: true,
    });
    const res = await start(executor, { procedureId, versionNo: 1, variables: DEFAULT_VALUES });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
  });

  it("D-34: 未公開の手順書は、作成者ロールのない実行者には NOT_FOUND", async () => {
    const { authorId, executor } = await people();
    const procedureId = await insertProcedure({ createdBy: authorId, draft: sampleContent() });
    const res = await start(executor, { procedureId, versionNo: 1, variables: {} });
    expect(res.status).toBe(404);

    await createUser({ username: "both01", role: "worker" });
    const res2 = await start(await login("both01"), { procedureId, versionNo: 1, variables: {} });
    expect(res2.status).toBe(409);
    expect((await readJson(res2)).code).toBe("STATE_CONFLICT");
  });

  it("D-01: 秘密変数の値を送ると VALIDATION_FAILED で、実行はできない", async () => {
    const { authorId, executor } = await people();
    const procedureId = await publishedProcedure(authorId);
    const res = await start(executor, {
      procedureId,
      versionNo: 1,
      variables: { ...DEFAULT_VALUES, admin_password: "Dummy-Pass-123" },
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].path).toBe("variables.admin_password");
    expect(await db.select().from(executions)).toHaveLength(0);
  });

  it("秘密でない変数の過不足は VALIDATION_FAILED", async () => {
    const { authorId, executor } = await people();
    const procedureId = await publishedProcedure(authorId);

    const missing = await start(executor, {
      procedureId,
      versionNo: 1,
      variables: { host: "web01.example.test" },
    });
    expect(missing.status).toBe(400);
    expect((await readJson(missing)).errors).toEqual([
      { path: "variables.port", message: "値を入力してください。" },
    ]);

    const extra = await start(executor, {
      procedureId,
      versionNo: 1,
      variables: { ...DEFAULT_VALUES, user: "admin" },
    });
    expect(extra.status).toBe(400);
    expect((await readJson(extra)).errors).toEqual([
      { path: "variables.user", message: "この手順書にない変数です。" },
    ]);
    expect(await db.select().from(executions)).toHaveLength(0);
  });

  it("実行者ロールがなければ FORBIDDEN", async () => {
    const { authorId } = await people();
    const procedureId = await publishedProcedure(authorId);
    const res = await start(await login("author01"), {
      procedureId,
      versionNo: 1,
      variables: DEFAULT_VALUES,
    });
    expect(res.status).toBe(403);
  });
});
