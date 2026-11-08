import { newId } from "@tadori/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detail, publishedProcedure, startRun } from "../../../test/executions.ts";
import {
  captureOperationLogs,
  createUser,
  login,
  request,
  resetDb,
} from "../../../test/helpers.ts";
import { readXlsx } from "../../../test/xlsx.ts";
import { contentDisposition, exportFileName } from "./export-format.ts";

// Excel 出力の API（F-09、api.md 5.3）。レイアウトは export-workbook.test.ts で確かめる。

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const exportOf = (cookie: string, id: string) =>
  request(`/api/executions/${id}/export`, { cookie });

async function setup() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  const executorId = await createUser({ username: "exec01", role: "worker" });
  await createUser({ username: "view01", role: "viewer" });
  await createUser({ username: "admin01", role: "admin" });
  const executor = await login("exec01");
  const procedureId = await publishedProcedure(authorId);
  const id = await startRun(executor, procedureId);
  return { executor, executorId, id };
}

async function sheetOf(res: Response) {
  return (await readXlsx(await res.arrayBuffer())).getWorksheet("実行記録");
}

describe("GET /api/executions/:id/export", () => {
  it("F-09: 実行記録を .xlsx で返し、ログを出す", async () => {
    const { executor, executorId, id } = await setup();
    const d = await detail(executor, id);
    const logs = captureOperationLogs();
    const res = await exportOf(executor, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toBe(
      contentDisposition(exportFileName(d.procedure.title, 1, d.startedAt)),
    );
    expect(await sheetOf(res)).toBeDefined();
    const exported = logs.filter((l) => l.event === "execution.exported");
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      actorId: executorId,
      target: { type: "execution", id },
    });
  });

  it("F-09: 閲覧者も出力できる", async () => {
    const { id } = await setup();
    expect((await exportOf(await login("view01"), id)).status).toBe(200);
    expect((await exportOf(await login("admin01"), id)).status).toBe(200);
  });

  it("F-09 AC: 秘密変数の値が含まれない", async () => {
    const { executor, id } = await setup();
    const d = await detail(executor, id);
    const step2 = d.steps[1].stepId;
    const added = await request(`/api/executions/${id}/steps/${step2}/evidences`, {
      cookie: executor,
      json: { body: "reload ok ●●●●" },
    });
    expect(added.status).toBe(204);
    const ws = await sheetOf(await exportOf(executor, id));
    const texts: string[] = [];
    ws?.eachRow((row) => {
      row.eachCell((cell) => {
        texts.push(String(cell.value ?? ""));
      });
    });
    expect(texts.some((t) => t.includes("#{admin_password}"))).toBe(false);
    expect(texts).toContain("echo ●●●● | sudo -S systemctl reload nginx");
    expect(texts.some((t) => t.endsWith("reload ok ●●●●"))).toBe(true);
  });

  it("存在しない実行は NOT_FOUND でログを出さない", async () => {
    const { executor } = await setup();
    const logs = captureOperationLogs();
    const res = await exportOf(executor, newId());
    expect(res.status).toBe(404);
    expect(logs.filter((l) => l.event === "execution.exported")).toHaveLength(0);
  });

  it("ログインしていなければ 401", async () => {
    const { id } = await setup();
    expect((await request(`/api/executions/${id}/export`)).status).toBe(401);
  });
});
