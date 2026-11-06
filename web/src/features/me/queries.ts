import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

// 自分の情報（GET /api/me）。共通のヘッダと操作の出し分けに使う。
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await api.me.$get()).json(),
  staleTime: 30_000,
});
