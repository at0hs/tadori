import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard.ts";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("navigator.clipboard があれば使う", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyText("ssh web01");
    expect(writeText).toHaveBeenCalledWith("ssh web01");
  });

  it("HTTP（安全でない接続）で navigator.clipboard がなければ、execCommand でコピーする", async () => {
    vi.stubGlobal("navigator", {});
    let copied = "";
    document.execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
    await copyText("ssh web01");
    expect(copied).toBe("ssh web01");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("どちらもできなければ失敗する", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = vi.fn(() => false);
    await expect(copyText("x")).rejects.toThrow();
  });
});
