import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, login, readJson, request, resetDb } from "../test/helpers.ts";
import { versionInfo } from "./version.ts";

// GET /api/version（api.md 4.7、D-69）。版はログインした人だけに見せる。
beforeEach(resetDb);

const rootVersion = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

describe("GET /api/version", () => {
  it("ログインしていなければ 401", async () => {
    const res = await request("/api/version");
    expect(res.status).toBe(401);
  });

  it("ログインすると版と SHA を返す", async () => {
    await createUser({ username: "viewer01" });
    const res = await request("/api/version", { cookie: await login("viewer01") });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(versionInfo);
    expect(body.version).toBe(rootVersion);
  });

  it("パスワードの変更前でも返す", async () => {
    await createUser({ username: "newbie01", mustChangePassword: true });
    const res = await request("/api/version", { cookie: await login("newbie01") });
    expect(res.status).toBe(200);
  });

  it("health には版を出さない", async () => {
    const res = await request("/api/health");
    expect(await readJson(res)).toEqual({ status: "ok" });
  });
});
