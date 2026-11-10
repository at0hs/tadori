import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

// 動いているビルドの版と SHA（GET /api/version、D-69）。動いている間は変わらないので取り直さない。
export const versionQueryOptions = queryOptions({
  queryKey: ["version"],
  queryFn: async () => (await api.version.$get()).json(),
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
});
