import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "./api.ts";

// 画面全体に効くエラーの動き（screens.md 8章、ui.md 5.2）。ほかのエラーは各画面が出す。

export type GlobalErrorAction = "login" | "change-password";

export function globalErrorAction(e: unknown): GlobalErrorAction | null {
  if (isApiError(e, "UNAUTHENTICATED")) return "login";
  if (isApiError(e, "PASSWORD_CHANGE_REQUIRED")) return "change-password";
  return null;
}

export function createQueryClient(onGlobalError: (action: GlobalErrorAction) => void): QueryClient {
  const onError = (e: unknown, meta?: Record<string, unknown>) => {
    // 権限なし・パスワード変更が必要は、自分の状態（ロールなど）が変わった合図なので me を取り直す
    if (isApiError(e, "FORBIDDEN") || isApiError(e, "PASSWORD_CHANGE_REQUIRED")) {
      void client.invalidateQueries({ queryKey: ["me"] });
    }
    const action = globalErrorAction(e);
    // 編集画面の保存などは、入力中の内容を残すためにログインへ移さない（screens.md 8章）
    if (action === "login" && meta?.keepOnUnauthenticated === true) return;
    if (action) onGlobalError(action);
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (e) => onError(e) }),
    mutationCache: new MutationCache({
      onError: (e, _vars, _ctx, mutation) => onError(e, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        // API のエラー（4xx など）は繰り返しても同じなので、やり直さない
        retry: (count, e) => !isApiError(e) && count < 1,
        refetchOnWindowFocus: true,
      },
    },
  });
  return client;
}
