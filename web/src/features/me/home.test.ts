import { describe, expect, it } from "vitest";
import { HOME_SECTION_LIMIT, homeSections, visibleItems } from "./home.ts";

describe("homeSections", () => {
  it("返った区画だけを、自分の実行・承認待ち・編集中の手順書の順に並べる", () => {
    expect(homeSections({ drafts: [], myExecutions: [] })).toEqual(["myExecutions", "drafts"]);
    expect(homeSections({ drafts: [], pendingApprovals: [], myExecutions: [] })).toEqual([
      "myExecutions",
      "pendingApprovals",
      "drafts",
    ]);
  });

  it("区画がなければ空", () => {
    expect(homeSections({})).toEqual([]);
  });
});

describe("visibleItems", () => {
  it(`先頭の ${HOME_SECTION_LIMIT} 件を出し、残りの数を返す`, () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    expect(visibleItems(items)).toEqual({ shown: [1, 2, 3, 4, 5], rest: 2 });
  });

  it("上限ちょうどなら残りは 0", () => {
    expect(visibleItems([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3, 4, 5], rest: 0 });
  });
});
