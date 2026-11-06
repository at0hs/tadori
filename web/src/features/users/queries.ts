import type { CreateUserRequest, Role } from "@tadori/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/features/me/queries.ts";
import { api } from "@/lib/api.ts";

// 管理者のユーザー管理（api.md 4.6）。変更の後は一覧と詳細を取り直し、対象が自分なら me も取り直す。

const usersKey = ["admin", "users"] as const;

export const usersQueryOptions = queryOptions({
  queryKey: usersKey,
  queryFn: async () => (await (await api.admin.users.$get()).json()).users,
});

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...usersKey, id],
    queryFn: async () => (await (await api.admin.users[":id"].$get({ param: { id } })).json()).user,
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return async (opts: { self: boolean }) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: usersKey }),
      opts.self ? queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }) : null,
    ]);
  };
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateUserRequest) =>
      (await api.admin.users.$post({ json: input })).json(),
    onSuccess: () => invalidate({ self: false }),
  });
}

export function useSetRole(userId: string, isSelf: boolean) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ role, on }: { role: Role; on: boolean }) => {
      const target = api.admin.users[":id"].roles[":role"];
      const param = { id: userId, role };
      await (on ? target.$put({ param }) : target.$delete({ param }));
    },
    // 失敗しても取り直して、スイッチをサーバーの状態に戻す
    onSettled: () => invalidate({ self: isSelf }),
  });
}

export function useBanUser(userId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      await api.admin.users[":id"].ban.$post({ param: { id: userId } });
    },
    onSettled: () => invalidate({ self: false }),
  });
}

export function useResetPassword(userId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (password: string) => {
      await api.admin.users[":id"]["password-reset"].$post({
        param: { id: userId },
        json: { password },
      });
    },
    onSuccess: () => invalidate({ self: false }),
  });
}
