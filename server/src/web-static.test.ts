import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRootApp } from "./web-static.ts";

// API の代わり。/api/health だけ答え、ほかは JSON の 404。
const api = new Hono().basePath("/api").get("/health", (c) => c.json({ status: "ok" }));
api.notFound((c) => c.json({ code: "NOT_FOUND" }, 404));

let parent: string;
let distDir: string;

beforeAll(() => {
  parent = mkdtempSync(join(tmpdir(), "tadori-static-"));
  distDir = join(parent, "dist");
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<p>index</p>");
  writeFileSync(join(distDir, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(parent, "secret.txt"), "top-secret");
  writeFileSync(join(distDir, "THIRD_PARTY_LICENSES.txt"), "ライセンス");
});

afterAll(() => {
  rmSync(parent, { recursive: true, force: true });
});

describe("画面の配信", () => {
  const root = () => createRootApp({ api, distDir });

  it("/ は index.html を返し、毎回確かめさせる", async () => {
    const res = await root().request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("index");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("画面の URL を直接開くと index.html を返す", async () => {
    const res = await root().request("/executions/0190-xyz");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("index");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("assets の下は長く持たせる", async () => {
    const res = await root().request("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("ライセンスの一覧は UTF-8 の文字として返す（D-69、見出しが日本語）", async () => {
    const res = await root().request("/THIRD_PARTY_LICENSES.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("ライセンス");
  });

  it("assets の下にないファイルは 404 で、index.html を返さない", async () => {
    const res = await root().request("/assets/missing.js");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("index");
  });

  it("/api は API に渡し、合わない URL は API の 404 のまま", async () => {
    const ok = await root().request("/api/health");
    expect(await ok.json()).toEqual({ status: "ok" });
    const nope = await root().request("/api/nope");
    expect(nope.status).toBe(404);
    expect(nope.headers.get("Content-Type")).toContain("application/json");
  });

  it.each(["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"])(
    "画面の置き場の外のファイルは返さない（%s）",
    async (path) => {
      const res = await root().request(path);
      expect(await res.text()).not.toContain("top-secret");
    },
  );

  it("/api 以外の POST は 404", async () => {
    const res = await root().request("/anything", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("置き場を指定しなければ画面は配信しない", async () => {
    const res = await createRootApp({ api }).request("/");
    expect(res.status).toBe(404);
  });
});
