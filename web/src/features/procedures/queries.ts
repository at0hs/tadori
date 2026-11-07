import type { DraftLock, ProcedureContent } from "@tadori/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

// 手順書・版・下書き（api.md 4.3）。変更の後は手順書の Query を取り直す。
// 編集画面の操作（作成・保存・公開・破棄）は、セッションが切れてもログインへ移さない（screens.md 8章）。

const key = ["procedures"] as const;
const keepInput = { keepOnUnauthenticated: true } as const;

export const procedureListQueryOptions = queryOptions({
  queryKey: [...key, "list"],
  queryFn: async () => (await (await api.procedures.$get()).json()).procedures,
});

export const procedureQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...key, id, "detail"],
    queryFn: async () => (await api.procedures[":id"].$get({ param: { id } })).json(),
  });

export const versionsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...key, id, "versions"],
    queryFn: async () => (await api.procedures[":id"].versions.$get({ param: { id } })).json(),
  });

export const versionQueryOptions = (id: string, versionNo: number) =>
  queryOptions({
    queryKey: [...key, id, "versions", versionNo],
    queryFn: async () =>
      (
        await api.procedures[":id"].versions[":versionNo"].$get({
          param: { id, versionNo: String(versionNo) },
        })
      ).json(),
  });

/**
 * 編集画面に読み込む内容。画面を開くたびに最新を読み（古い revision で始めない）、
 * 開いている間は取り直さない（フォームは最初の値だけを使う）。
 */
export const draftQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["procedure-draft", id],
    queryFn: async () => (await api.procedures[":id"].draft.$get({ param: { id } })).json(),
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: key });
}

export function useCreateProcedure() {
  const invalidate = useInvalidate();
  return useMutation({
    meta: keepInput,
    mutationFn: async (content: ProcedureContent) =>
      (await api.procedures.$post({ json: { content } })).json(),
    onSuccess: invalidate,
  });
}

export function useSaveDraft(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    meta: keepInput,
    mutationFn: async (input: { content: ProcedureContent; lock: DraftLock }) =>
      (await api.procedures[":id"].draft.$put({ param: { id }, json: input })).json(),
    onSuccess: invalidate,
  });
}

/** 公開。S-08 では作成した直後の手順書に向けて呼ぶので、ID は引数で受ける。 */
export function usePublish() {
  const invalidate = useInvalidate();
  return useMutation({
    meta: keepInput,
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      content: ProcedureContent;
      lock: DraftLock;
      changeReason: string;
    }) => (await api.procedures[":id"].publish.$post({ param: { id }, json: input })).json(),
    onSuccess: invalidate,
  });
}

export function useDiscardDraft(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    meta: keepInput,
    mutationFn: async (revision: number) =>
      (
        await api.procedures[":id"].draft.$delete({
          param: { id },
          query: { revision: String(revision) },
        })
      ).json(),
    onSuccess: invalidate,
  });
}

export function useArchive(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      await api.procedures[":id"].archive.$post({ param: { id } });
    },
    onSettled: invalidate,
  });
}
