import { expect, test } from "vitest";
import { visibleNavItems } from "./nav.ts";

test("管理者でなければ管理を出さない", () => {
  expect(visibleNavItems(["executor"]).map((i) => i.label)).toEqual(["ホーム", "手順書", "実行"]);
  expect(visibleNavItems(["admin"]).map((i) => i.label)).toEqual([
    "ホーム",
    "手順書",
    "実行",
    "管理",
  ]);
});
