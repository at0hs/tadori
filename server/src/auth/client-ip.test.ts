import { getIP } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { rewriteForwardedFor } from "./client-ip.ts";

describe("Caddy の後ろ（D-67、operations.md 9章）", () => {
  // auth.ts と同じ形。TRUSTED_PROXIES には Caddy の決まった IP（CADDY_IP の既定）だけを書く
  const options = { advanced: { ipAddress: { trustedProxies: ["10.203.53.2"] } } };
  const ipOf = (xff: string | null) =>
    getIP(new Headers({ "x-forwarded-for": xff ?? "" }), options);

  it("接続相手が ::ffff: の形の Caddy の IP でも、Caddy が付けた利用者の IP を読む", () => {
    // app は :: で待ち受けるので、Caddy からの接続は IPv4 を写した IPv6 の形に見えることがある
    expect(ipOf(rewriteForwardedFor("192.0.2.50", "::ffff:10.203.53.2", true))).toBe("192.0.2.50");
  });

  it("ゲートウェイ（10.203.53.1）は信頼しない。その先の、利用者が付けた偽の値を読まない", () => {
    // Caddy は利用者が付けた値を捨てて付け直すが、念のため偽の値が残っていても読まないことを押さえる。
    // TRUSTED_PROXIES に範囲（10.203.53.0/24）を書くと、ここで偽の値を読んでしまう
    expect(ipOf(rewriteForwardedFor("203.0.113.99, 10.203.53.1", "::ffff:10.203.53.2", true))).toBe(
      "10.203.53.1",
    );
  });
});

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
