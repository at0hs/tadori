import type { DraftLock, ProcedureContent } from "@tadori/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureOperationLogs,
  createUser,
  login,
  readJson,
  request,
  resetDb,
} from "../../../test/helpers.ts";
import { sampleContent, sampleStep } from "../../../test/procedures.ts";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

async function author(username = "author01") {
  const id = await createUser({ username, roles: ["author"] });
  return { id, cookie: await login(username) };
}

const create = (cookie: string, content: ProcedureContent = sampleContent()) =>
  request("/api/procedures", { cookie, json: { content } });

async function created(cookie: string, content?: ProcedureContent): Promise<string> {
  const res = await create(cookie, content);
  expect(res.status).toBe(201);
  return (await readJson(res)).id;
}

const save = (cookie: string, id: string, lock: DraftLock, content = sampleContent()) =>
  request(`/api/procedures/${id}/draft`, { cookie, method: "PUT", json: { content, lock } });

const publish = (
  cookie: string,
  id: string,
  lock: DraftLock,
  content = sampleContent(),
  changeReason = "手順を足した",
) => request(`/api/procedures/${id}/publish`, { cookie, json: { content, lock, changeReason } });

const discard = (cookie: string, id: string, revision: number) =>
  request(`/api/procedures/${id}/draft?revision=${revision}`, { cookie, method: "DELETE" });

const archive = (cookie: string, id: string) =>
  request(`/api/procedures/${id}/archive`, { cookie, method: "POST" });

const detail = async (cookie: string, id: string) =>
  readJson(await request(`/api/procedures/${id}`, { cookie }));

const draftOf = async (cookie: string, id: string) =>
  readJson(await request(`/api/procedures/${id}/draft`, { cookie }));

/** 作成して v1 を公開した手順書。 */
async function published(cookie: string, content = sampleContent()) {
  const id = await created(cookie, content);
  expect((await publish(cookie, id, { revision: 1 }, content)).status).toBe(200);
  return id;
}

describe("作成", () => {
  it("F-02: 作成すると未公開の手順書と revision 1 の下書きができる", async () => {
    const a = await author();
    const res = await create(a.cookie);
    expect(res.status).toBe(201);
    const { id, revision } = await readJson(res);
    expect(revision).toBe(1);
    expect(await draftOf(a.cookie, id)).toMatchObject({
      status: "unpublished",
      lock: { revision: 1 },
      baseVersionNo: null,
      updatedBy: { id: a.id },
    });
  });

  it("F-02 AC: タイトルのない手順書は保存できない", async () => {
    const a = await author();
    const res = await create(a.cookie, sampleContent({ title: "" }));
    expect(res.status).toBe(400);
    expect((await readJson(res)).errors[0].path).toBe("content.title");
  });
});

describe("保存", () => {
  it("F-03: 下書きを保存しても版数は上がらない", async () => {
    const a = await author();
    const id = await published(a.cookie);

    const first = await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect(first.status).toBe(200);
    expect((await readJson(first)).revision).toBe(1);
    const second = await save(a.cookie, id, { revision: 1 }, sampleContent({ title: "変えた" }));
    expect((await readJson(second)).revision).toBe(2);

    const body = await detail(a.cookie, id);
    expect(body.status).toBe("editing");
    expect(body.latestVersion.versionNo).toBe(1);
    expect(body.latestVersion.content.title).toBe("nginx の設定変更");
  });

  it("D-28: 下書きがない状態で保存すると、元にした版数を持つ下書きができる", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect(await draftOf(a.cookie, id)).toMatchObject({ baseVersionNo: 1, lock: { revision: 1 } });
  });

  it("F-03 AC: 他のユーザーが先に保存した下書きを、古い内容で上書きできない", async () => {
    const a = await author("author01");
    const b = await author("author02");
    const id = await created(a.cookie);

    expect((await save(b.cookie, id, { revision: 1 })).status).toBe(200);
    const res = await save(a.cookie, id, { revision: 1 }, sampleContent({ title: "古い内容" }));
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body).toMatchObject({
      code: "DRAFT_CONFLICT",
      reason: "draft_saved",
      updatedBy: { id: b.id, name: "author02 さん" },
    });
    expect(typeof body.updatedAt).toBe("string");
    expect((await draftOf(a.cookie, id)).content.title).toBe("nginx の設定変更");
  });

  it("D-55: 同じ版から編集を始め、相手が保存して公開した後に保存すると DRAFT_CONFLICT", async () => {
    const a = await author("author01");
    const b = await author("author02");
    const id = await published(a.cookie);
    // 2人とも v1 を読み込んだ（下書きなし）
    expect((await save(b.cookie, id, { revision: null, versionNo: 1 })).status).toBe(200);
    expect((await publish(b.cookie, id, { revision: 1 })).status).toBe(200);

    const res = await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toMatchObject({
      code: "DRAFT_CONFLICT",
      reason: "version_published",
      updatedBy: { id: b.id },
    });
  });

  it("下書きがない状態で読み込んだのに、相手が下書きを作っていれば DRAFT_CONFLICT", async () => {
    const a = await author("author01");
    const b = await author("author02");
    const id = await published(a.cookie);
    await save(b.cookie, id, { revision: null, versionNo: 1 });
    const res = await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect(await readJson(res)).toMatchObject({ code: "DRAFT_CONFLICT", reason: "draft_saved" });
  });

  it("下書きを破棄された後に古い revision で保存すると DRAFT_CONFLICT", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect((await discard(a.cookie, id, 1)).status).toBe(200);
    const res = await save(a.cookie, id, { revision: 1 });
    expect(await readJson(res)).toMatchObject({
      code: "DRAFT_CONFLICT",
      reason: "draft_discarded",
      updatedBy: null,
      updatedAt: null,
    });
  });

  it("lock の形が違えば VALIDATION_FAILED", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await request(`/api/procedures/${id}/draft`, {
      cookie: a.cookie,
      method: "PUT",
      json: { content: sampleContent(), lock: { revision: null } },
    });
    expect(res.status).toBe(400);
  });

  it("存在しない手順書への保存は NOT_FOUND", async () => {
    const a = await author();
    const res = await save(a.cookie, "01970000-0000-7000-8000-000000000000", { revision: 1 });
    expect(res.status).toBe(404);
  });
});

describe("公開", () => {
  it("F-03: 公開すると版数が1つ上がり、下書きが消え、操作ログが出る", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await save(a.cookie, id, { revision: null, versionNo: 1 });

    const logs = captureOperationLogs();
    const res = await publish(
      a.cookie,
      id,
      { revision: 1 },
      sampleContent({ title: "v2" }),
      "理由",
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ versionNo: 2 });

    const body = await detail(a.cookie, id);
    expect(body.status).toBe("published");
    expect(body.latestVersion).toMatchObject({ versionNo: 2, changeReason: "理由" });
    expect(body.latestVersion.content.title).toBe("v2");
    expect(logs).toEqual([
      expect.objectContaining({
        event: "procedure.published",
        actorId: a.id,
        target: { type: "procedure", id },
        versionNo: 2,
      }),
    ]);
  });

  it("F-03: 下書きがない状態からも公開できる（保存と公開を1つの操作で行う）", async () => {
    const a = await author();
    const id = await published(a.cookie);
    const res = await publish(a.cookie, id, { revision: null, versionNo: 1 });
    expect(await readJson(res)).toEqual({ versionNo: 2 });
  });

  it("F-03: 公開には変更理由が必須", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await publish(a.cookie, id, { revision: 1 }, sampleContent(), "  ");
    expect(res.status).toBe(400);
    expect((await readJson(res)).errors[0].path).toBe("changeReason");
  });

  it("F-02 AC: 未定義の変数を参照していると公開できない（何も変わらない）", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const content = sampleContent({ steps: [sampleStep({ command: "ssh #{hostname}" })] });
    const res = await publish(a.cookie, id, { revision: 1 }, content);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [
        { path: "content.steps.0.command", message: "未定義の変数 #{hostname} を参照しています。" },
      ],
    });
    expect(await draftOf(a.cookie, id)).toMatchObject({
      status: "unpublished",
      lock: { revision: 1 },
    });
  });

  it("F-02 AC: 手順のステップが0件なら公開できない", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await publish(a.cookie, id, { revision: 1 }, sampleContent({ steps: [] }));
    expect((await readJson(res)).errors).toEqual([
      { path: "content.steps", message: "公開するには、手順のステップが1つ以上必要です。" },
    ]);
  });

  it("古い revision での公開は DRAFT_CONFLICT", async () => {
    const a = await author();
    const id = await created(a.cookie);
    await save(a.cookie, id, { revision: 1 });
    const res = await publish(a.cookie, id, { revision: 1 });
    expect((await readJson(res)).code).toBe("DRAFT_CONFLICT");
  });

  it("F-03 AC: 公開済みの版の内容は、どの操作をしても変わらない", async () => {
    const a = await author();
    const v1 = sampleContent({ title: "最初の版" });
    const id = await published(a.cookie, v1);
    const before = await readJson(
      await request(`/api/procedures/${id}/versions/1`, { cookie: a.cookie }),
    );

    await save(a.cookie, id, { revision: null, versionNo: 1 }, sampleContent({ title: "下書き" }));
    await discard(a.cookie, id, 1);
    await save(a.cookie, id, { revision: null, versionNo: 1 }, sampleContent({ title: "下書き2" }));
    await publish(a.cookie, id, { revision: 1 }, sampleContent({ title: "v2" }));
    await archive(a.cookie, id);

    const after = await readJson(
      await request(`/api/procedures/${id}/versions/1`, { cookie: a.cookie }),
    );
    expect(after).toEqual({ ...before, latestVersionNo: 2 });
    expect(after.content).toEqual(v1);
  });
});

describe("破棄", () => {
  it("D-29: 未公開の手順書の下書きを破棄すると手順書ごと消える", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await discard(a.cookie, id, 1);
    expect(await readJson(res)).toEqual({ deleted: "procedure" });
    expect((await request(`/api/procedures/${id}`, { cookie: a.cookie })).status).toBe(404);
  });

  it("F-03: 公開済みの手順書の下書きを破棄すると最新版の状態に戻る", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await save(a.cookie, id, { revision: null, versionNo: 1 }, sampleContent({ title: "下書き" }));
    const res = await discard(a.cookie, id, 1);
    expect(await readJson(res)).toEqual({ deleted: "draft" });
    expect((await detail(a.cookie, id)).status).toBe("published");
  });

  it("古い revision での破棄は DRAFT_CONFLICT", async () => {
    const a = await author();
    const id = await created(a.cookie);
    await save(a.cookie, id, { revision: 1 });
    expect((await readJson(await discard(a.cookie, id, 1))).code).toBe("DRAFT_CONFLICT");
  });

  it("revision がなければ VALIDATION_FAILED", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await request(`/api/procedures/${id}/draft`, {
      cookie: a.cookie,
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).errors[0].path).toBe("revision");
  });
});

describe("アーカイブ", () => {
  it("D-07: アーカイブすると下書きが消え、保存はできず、操作ログが出る", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await save(a.cookie, id, { revision: null, versionNo: 1 });

    const logs = captureOperationLogs();
    expect((await archive(a.cookie, id)).status).toBe(204);
    expect(logs).toEqual([
      expect.objectContaining({
        event: "procedure.archived",
        actorId: a.id,
        target: { type: "procedure", id },
      }),
    ]);
    expect((await detail(a.cookie, id)).status).toBe("archived");

    const res = await save(a.cookie, id, { revision: null, versionNo: 1 });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
  });

  it("D-29: 未公開の手順書はアーカイブできない", async () => {
    const a = await author();
    const id = await created(a.cookie);
    const res = await archive(a.cookie, id);
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
  });

  it("D-07: アーカイブ済みの手順書はもう一度アーカイブできない", async () => {
    const a = await author();
    const id = await published(a.cookie);
    await archive(a.cookie, id);
    expect((await archive(a.cookie, id)).status).toBe(409);
  });
});

describe("権限", () => {
  it("作成者ロールがなければ、書き込みの API はすべて FORBIDDEN", async () => {
    const a = await author();
    const id = await created(a.cookie);
    await createUser({ username: "other01", roles: ["viewer", "executor", "approver", "admin"] });
    const other = await login("other01");

    const results = await Promise.all([
      create(other),
      save(other, id, { revision: 1 }),
      publish(other, id, { revision: 1 }),
      discard(other, id, 1),
      archive(other, id),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
  });
});
