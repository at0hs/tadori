import { describe, expect, it } from "vitest";
import { rewriteForwardedFor } from "./client-ip.ts";

describe("rewriteForwardedFor（D-60）", () => {
  it("プロキシを指定していないとき、利用者が付けた値を捨てて接続相手のアドレスにする", () => {
    expect(rewriteForwardedFor("203.0.113.9", "192.0.2.1", false)).toBe("192.0.2.1");
    expect(rewriteForwardedFor(null, "192.0.2.1", false)).toBe("192.0.2.1");
  });

  it("プロキシを指定しているとき、受け取った値の末尾に接続相手のアドレスを足す", () => {
    expect(rewriteForwardedFor("203.0.113.9", "10.0.0.2", true)).toBe("203.0.113.9, 10.0.0.2");
    expect(rewriteForwardedFor(null, "10.0.0.2", true)).toBe("10.0.0.2");
  });

  it("接続相手が分からないときは、ヘッダを消す", () => {
    expect(rewriteForwardedFor("203.0.113.9", undefined, false)).toBeNull();
    expect(rewriteForwardedFor("203.0.113.9", undefined, true)).toBeNull();
  });
});
