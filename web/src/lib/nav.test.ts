import { expect, test } from "vitest";
import { visibleNavItems } from "./nav.ts";

test("管理者でなければ管理を出さない（承認者でも出さない）", () => {
  for (const role of ["approver", "worker", "viewer"] as const) {
    expect(visibleNavItems(role).map((i) => i.label)).toEqual(["ホーム", "手順書", "実行"]);
  }
  expect(visibleNavItems("admin").map((i) => i.label)).toEqual([
    "ホーム",
    "手順書",
    "実行",
    "管理",
  ]);
});
