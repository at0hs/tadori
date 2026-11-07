import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

// 自分の情報（GET /api/me）。共通のヘッダと操作の出し分けに使う。
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await api.me.$get()).json(),
  staleTime: 30_000,
});

/** ログイン後の画面で自分の情報を読む（_app の beforeLoad で読み込み済み）。 */
export function useMe() {
  return useSuspenseQuery(meQueryOptions).data;
}

// ホーム（GET /api/me/home）。S-12 などで状態を変えてから戻ったときに古い区画を出さないよう、
// 開くたびに取り直す。
export const homeQueryOptions = queryOptions({
  queryKey: ["me", "home"],
  queryFn: async () => (await api.me.home.$get()).json(),
  staleTime: 0,
});
