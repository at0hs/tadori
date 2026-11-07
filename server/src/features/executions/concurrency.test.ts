import { beforeEach, describe, expect, it } from "vitest";
import { detail, publishedProcedure, startRun } from "../../../test/executions.ts";
import { createUser, login, request, resetDb } from "../../../test/helpers.ts";

// 同じ実行への同時の操作（conventions.md 4章、D-46）。2つのリクエストは別々の接続で同じ行を操作する。
beforeEach(resetDb);

describe("同時の操作", () => {
  it("D-46: 同じステップへ同じ from で同時に送ると、片方だけが通る", async () => {
    const authorId = await createUser({ username: "author01", roles: ["author"] });
    await createUser({ username: "exec01", roles: ["executor"] });
    const executor = await login("exec01");
    const id = await startRun(executor, await publishedProcedure(authorId));
    const stepId = (await detail(executor, id)).steps[0].stepId as string;

    const results = await Promise.all(
      (["done", "failed"] as const).map((to) =>
        request(`/api/executions/${id}/steps/${stepId}/status-changes`, {
          cookie: executor,
          json: { from: "pending", to, skipReason: null },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect((await detail(executor, id)).steps[0].history).toHaveLength(1);
  });
});
