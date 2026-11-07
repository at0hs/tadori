import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

const base = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://tadori:dummy@localhost:5432/tadori",
  BETTER_AUTH_SECRET: "check-secret-check-secret-check-secret-0123",
};
const exampleSecret = "dev-secret-dev-secret-dev-secret-0123456789";

describe("config", () => {
  it("必要な値だけで読め、画面の置き場は指定しなければない", () => {
    const config = parseConfig(base);
    expect(config.WEB_DIST_DIR).toBeUndefined();
    expect(config.PORT).toBe(3000);
  });

  it("本番では .env.example のダミーの秘密鍵を断る", () => {
    expect(() =>
      parseConfig({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: exampleSecret }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("開発ではダミーの秘密鍵でも読める", () => {
    expect(parseConfig({ ...base, BETTER_AUTH_SECRET: exampleSecret }).BETTER_AUTH_SECRET).toBe(
      exampleSecret,
    );
  });

  it("画面の置き場を受け取る", () => {
    expect(parseConfig({ ...base, WEB_DIST_DIR: "/app/web/dist" }).WEB_DIST_DIR).toBe(
      "/app/web/dist",
    );
  });
});
