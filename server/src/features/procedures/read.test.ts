import { beforeEach, describe, expect, it } from "vitest";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { insertProcedure, sampleContent } from "../../../test/procedures.ts";

beforeEach(resetDb);

const UNKNOWN_ID = "01970000-0000-7000-8000-000000000000";

/** 作成者と閲覧者を作ってログインする。 */
async function people() {
  const authorId = await createUser({ username: "author01", role: "worker" });
  await createUser({ username: "viewer01", role: "viewer" });
  return { authorId, author: await login("author01"), viewer: await login("viewer01") };
}

async function list(cookie: string) {
  const res = await request("/api/procedures", { cookie });
  expect(res.status).toBe(200);
  return (await readJson(res)).procedures as { id: string; [k: string]: unknown }[];
}

describe("GET /api/procedures", () => {
  it("F-02: 一覧にタイトル・タグ・状態・最新の版数・最終公開日時が出る", async () => {
    const { authorId, viewer } = await people();
    const pub = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent(), sampleContent()],
    });
    const editing = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "証明書の更新" })],
      draft: sampleContent({ title: "証明書の更新（下書き）" }),
    });
    const archived = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "古い手順" })],
      archived: true,
    });

    const rows = await list(viewer);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(pub)).toEqual({
      id: pub,
      title: "nginx の設定変更",
      summary: "web01 の nginx の worker 数を変更する",
      tags: ["nginx", "web"],
      status: "published",
      latestVersionNo: 2,
      lastPublishedAt: "2026-11-02T00:00:00.000Z",
    });
    expect(byId.get(editing)?.status).toBe("editing");
    expect(byId.get(archived)?.status).toBe("archived");
  });

  it("D-34: 作成者ロールのない人には、未公開の手順書は一覧に出ない", async () => {
    const { authorId, author, viewer } = await people();
    const draftOnly = await insertProcedure({
      createdBy: authorId,
      draft: sampleContent({ title: "書きかけ" }),
    });

    expect((await list(viewer)).map((r) => r.id)).not.toContain(draftOnly);
    const forAuthor = (await list(author)).find((r) => r.id === draftOnly);
    expect(forAuthor).toMatchObject({
      status: "unpublished",
      title: "書きかけ",
      latestVersionNo: null,
      lastPublishedAt: null,
    });
  });

  it("D-49: 公開済みの手順書の一覧は、下書きではなく最新版のタイトルを返す", async () => {
    const { authorId, author, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "公開中のタイトル", tags: ["a"] })],
      draft: sampleContent({ title: "下書きのタイトル", tags: ["b"] }),
    });
    for (const cookie of [author, viewer]) {
      const row = (await list(cookie)).find((r) => r.id === id);
      expect(row).toMatchObject({ title: "公開中のタイトル", tags: ["a"] });
    }
  });
});

describe("GET /api/procedures/{id}", () => {
  it("最新版の内容と、版数・公開者・公開日時・変更理由を返す", async () => {
    const { authorId, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "v1" }), sampleContent({ title: "v2" })],
    });
    const res = await request(`/api/procedures/${id}`, { cookie: viewer });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("published");
    expect(body.latestVersion).toMatchObject({
      versionNo: 2,
      changeReason: "2 版の変更",
      publishedAt: "2026-11-02T00:00:00.000Z",
    });
    expect(body.latestVersion.content.title).toBe("v2");
    expect(body.draft).toBeNull();
  });

  it("D-49: 公開者は id と name だけを返す", async () => {
    const { authorId, viewer } = await people();
    const id = await insertProcedure({ createdBy: authorId, versions: [sampleContent()] });
    const body = await readJson(await request(`/api/procedures/${id}`, { cookie: viewer }));
    expect(body.latestVersion.publishedBy).toEqual({ id: authorId, name: "author01 さん" });
  });

  it("D-49: 下書きの最終更新者・日時は作成者にだけ返す", async () => {
    const { authorId, author, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "公開中" })],
      draft: sampleContent({ title: "下書き" }),
    });

    const forViewer = await readJson(await request(`/api/procedures/${id}`, { cookie: viewer }));
    expect(forViewer.status).toBe("editing");
    expect(forViewer.draft).toBeNull();
    expect(forViewer.latestVersion.content.title).toBe("公開中");

    const forAuthor = await readJson(await request(`/api/procedures/${id}`, { cookie: author }));
    expect(forAuthor.draft.updatedBy).toEqual({ id: authorId, name: "author01 さん" });
    expect(typeof forAuthor.draft.updatedAt).toBe("string");
    expect(forAuthor.latestVersion.content.title).toBe("公開中");
  });

  it("D-34: 未公開の手順書は、作成者には版のない応答、それ以外には NOT_FOUND", async () => {
    const { authorId, author, viewer } = await people();
    const id = await insertProcedure({ createdBy: authorId, draft: sampleContent() });

    expect((await request(`/api/procedures/${id}`, { cookie: viewer })).status).toBe(404);
    const body = await readJson(await request(`/api/procedures/${id}`, { cookie: author }));
    expect(body).toMatchObject({ status: "unpublished", latestVersion: null });
  });

  it("存在しない ID・形の違う ID は NOT_FOUND", async () => {
    const { viewer } = await people();
    expect((await request(`/api/procedures/${UNKNOWN_ID}`, { cookie: viewer })).status).toBe(404);
    expect((await request("/api/procedures/abc", { cookie: viewer })).status).toBe(404);
  });
});

describe("版", () => {
  it("F-03: 版の一覧は新しい順で、版数・公開者・公開日時・変更理由を返す", async () => {
    const { authorId, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "v1" }), sampleContent({ title: "v2" })],
    });
    const body = await readJson(
      await request(`/api/procedures/${id}/versions`, { cookie: viewer }),
    );
    expect(body.title).toBe("v2");
    expect(body.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    expect(body.versions[1]).toEqual({
      versionNo: 1,
      changeReason: "最初の版",
      publishedBy: { id: authorId, name: "author01 さん" },
      publishedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("F-03: 過去の版の内容と最新の版数を見られる", async () => {
    const { authorId, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "v1" }), sampleContent({ title: "v2" })],
    });
    const body = await readJson(
      await request(`/api/procedures/${id}/versions/1`, { cookie: viewer }),
    );
    expect(body).toMatchObject({ versionNo: 1, latestVersionNo: 2, title: "v1" });
    expect(body.content.title).toBe("v1");
  });

  it("存在しない版・未公開の手順書の版は NOT_FOUND", async () => {
    const { authorId, author } = await people();
    const pub = await insertProcedure({ createdBy: authorId, versions: [sampleContent()] });
    const draftOnly = await insertProcedure({ createdBy: authorId, draft: sampleContent() });
    expect((await request(`/api/procedures/${pub}/versions/3`, { cookie: author })).status).toBe(
      404,
    );
    expect((await request(`/api/procedures/${pub}/versions/x`, { cookie: author })).status).toBe(
      404,
    );
    expect(
      (await request(`/api/procedures/${draftOnly}/versions`, { cookie: author })).status,
    ).toBe(404);
  });
});

describe("GET /api/procedures/{id}/draft", () => {
  it("D-34: 作成者ロールが必要", async () => {
    const { authorId, viewer } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent()],
      draft: sampleContent(),
    });
    expect((await request(`/api/procedures/${id}/draft`, { cookie: viewer })).status).toBe(403);
  });

  it("下書きがあれば下書きと revision を返す", async () => {
    const { authorId, author } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent()],
      draft: sampleContent({ title: "下書き" }),
    });
    const body = await readJson(await request(`/api/procedures/${id}/draft`, { cookie: author }));
    expect(body).toMatchObject({
      status: "editing",
      lock: { revision: 1 },
      baseVersionNo: 1,
      updatedBy: { id: authorId, name: "author01 さん" },
    });
    expect(body.content.title).toBe("下書き");
  });

  it("D-55: 下書きがなければ最新版の文書と版数を返す", async () => {
    const { authorId, author } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent({ title: "v1" }), sampleContent({ title: "v2" })],
    });
    const body = await readJson(await request(`/api/procedures/${id}/draft`, { cookie: author }));
    expect(body).toMatchObject({
      status: "published",
      lock: { revision: null, versionNo: 2 },
      baseVersionNo: 2,
      updatedBy: null,
      updatedAt: null,
    });
    expect(body.content.title).toBe("v2");
  });

  it("D-07: アーカイブした手順書は STATE_CONFLICT", async () => {
    const { authorId, author } = await people();
    const id = await insertProcedure({
      createdBy: authorId,
      versions: [sampleContent()],
      archived: true,
    });
    const res = await request(`/api/procedures/${id}/draft`, { cookie: author });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("STATE_CONFLICT");
  });
});
