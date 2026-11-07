import type { MeHomeResponse } from "@tadori/shared";

// ホーム（S-03、ui.md 9.2）の区画の並びと、区画ごとに出す件数。

/** 各区画に出す件数の上限。超えた分は「ほか N 件をすべて見る」にする */
export const HOME_SECTION_LIMIT = 5;

const ORDER = ["myExecutions", "pendingApprovals", "drafts"] as const;
export type HomeSectionKey = (typeof ORDER)[number];

/** 応答に入っている区画（持っているロールの区画）を、決まった順に返す */
export function homeSections(home: MeHomeResponse): HomeSectionKey[] {
  return ORDER.filter((k) => home[k] !== undefined);
}

/** 先頭の上限までと、残りの件数 */
export function visibleItems<T>(items: T[]): { shown: T[]; rest: number } {
  return {
    shown: items.slice(0, HOME_SECTION_LIMIT),
    rest: Math.max(0, items.length - HOME_SECTION_LIMIT),
  };
}
