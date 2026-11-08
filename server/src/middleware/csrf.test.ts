import { beforeEach, describe, expect, it } from "vitest";
import { createUser, ORIGIN, PASSWORD, readJson, request, resetDb } from "../../test/helpers.ts";

beforeEach(resetDb);

const signIn = (headers: Record<string, string>) =>
  request("/api/auth/sign-in/username", {
    headers,
    json: { username: "user01", password: PASSWORD },
  });

describe("CSRF：出どころの確認（D-61）", () => {
  beforeEach(async () => {
    await createUser({ username: "user01", role: "viewer" });
  });

  it("別のオリジンからの JSON の POST は 403", async () => {
    const res = await signIn({
      origin: "https://evil.example.test",
      "sec-fetch-site": "cross-site",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect((await readJson(res)).code).toBe("FORBIDDEN");
  });

  it("Origin も Sec-Fetch-Site もない POST は 403", async () => {
    const res = await signIn({ origin: "" });
    expect(res.status).toBe(403);
  });

  it("Origin が APP_URL と同じなら通る（アプリが受け取る URL が http でも）", async () => {
    expect((await signIn({ origin: ORIGIN })).status).toBe(200);
  });

  it("Sec-Fetch-Site が same-origin なら通る", async () => {
    expect((await signIn({ origin: "", "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("GET は確かめない", async () => {
    const res = await request("/api/health", { headers: { origin: "https://evil.example.test" } });
    expect(res.status).toBe(200);
  });
});
