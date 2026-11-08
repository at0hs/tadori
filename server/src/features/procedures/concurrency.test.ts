import { beforeEach, describe, expect, it } from "vitest";
import { createUser, login, readJson, request, resetDb } from "../../../test/helpers.ts";
import { sampleContent } from "../../../test/procedures.ts";

// 同時の操作（conventions.md 4章、7章）。2つのリクエストは別々の接続で同じ行を操作する。
beforeEach(resetDb);

async function setup() {
  await createUser({ username: "author01", role: "approver" });
  await createUser({ username: "author02", role: "approver" });
  const a = await login("author01");
  const b = await login("author02");
  const res = await request("/api/procedures", { cookie: a, json: { content: sampleContent() } });
  return { a, b, id: (await readJson(res)).id as string };
}

describe("同時の操作", () => {
  it("F-03 AC: 同じ revision で同時に保存すると、片方だけが通る", async () => {
    const { a, b, id } = await setup();
    const results = await Promise.all(
      [a, b].map((cookie) =>
        request(`/api/procedures/${id}/draft`, {
          cookie,
          method: "PUT",
          json: { content: sampleContent(), lock: { revision: 1 } },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const draft = await readJson(await request(`/api/procedures/${id}/draft`, { cookie: a }));
    expect(draft.lock).toEqual({ revision: 2 });
  });

  it("F-03: 同じ下書きを同時に公開しても、版は1つだけ増える", async () => {
    const { a, b, id } = await setup();
    const results = await Promise.all(
      [a, b].map((cookie) =>
        request(`/api/procedures/${id}/publish`, {
          cookie,
          json: { content: sampleContent(), lock: { revision: 1 }, changeReason: "最初の版" },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const versions = await readJson(await request(`/api/procedures/${id}/versions`, { cookie: a }));
    expect(versions.versions).toHaveLength(1);
  });
});
