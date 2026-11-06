import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, login, readJson, request, resetDb } from "../test/helpers.ts";
import { auth } from "./auth/auth.ts";
import { logger } from "./lib/logger.ts";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

describe("想定していないエラー（conventions.md 3.2、6.4）", () => {
  it("INTERNAL_ERROR を返し、応答とエラーログに同じ requestId を入れる。内部の情報は返さない", async () => {
    await createUser({ username: "admin01", roles: ["admin"] });
    const target = await createUser({ username: "user01" });
    const cookie = await login("admin01");
    vi.spyOn(auth.api, "banUser").mockRejectedValue(new Error("connection reset (dummy)"));
    const errorLog = vi
      .spyOn(logger, "error")
      .mockImplementation((() => {}) as typeof logger.error);

    const res = await request(`/api/admin/users/${target}/ban`, { method: "POST", cookie });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const body = await readJson(res);
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("connection reset");
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: body.requestId, err: expect.any(Error) }),
      expect.any(String),
    );
  });
});
