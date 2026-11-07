import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSecrets, getSecrets, setSecrets, subscribeSecrets } from "./secret-store.ts";

afterEach(() => clearSecrets());

describe("D-41: 秘密変数の置き場", () => {
  it("実行ごとに分かれる", () => {
    setSecrets("e1", { pw: "Dummy-Pass-1" });
    setSecrets("e2", { pw: "Dummy-Pass-2" });
    expect(getSecrets("e1")).toEqual({ pw: "Dummy-Pass-1" });
    expect(getSecrets("e2")).toEqual({ pw: "Dummy-Pass-2" });
    expect(getSecrets("e3")).toBeUndefined();
  });

  it("clearSecrets で全部消える", () => {
    setSecrets("e1", { pw: "Dummy-Pass-1" });
    setSecrets("e2", { pw: "Dummy-Pass-2" });
    clearSecrets();
    expect(getSecrets("e1")).toBeUndefined();
    expect(getSecrets("e2")).toBeUndefined();
  });

  it("渡した値を後から書き換えても、置き場は変わらない", () => {
    const values = { pw: "Dummy-Pass-1" };
    setSecrets("e1", values);
    values.pw = "changed";
    expect(getSecrets("e1")).toEqual({ pw: "Dummy-Pass-1" });
  });

  it("変わったら購読者に知らせる", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSecrets(listener);
    setSecrets("e1", { pw: "Dummy-Pass-1" });
    clearSecrets();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setSecrets("e1", { pw: "Dummy-Pass-1" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
