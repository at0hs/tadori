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
  const onError = (e: unknown) => {
    const action = globalErrorAction(e);
    if (action) onGlobalError(action);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // API のエラー（4xx など）は繰り返しても同じなので、やり直さない
        retry: (count, e) => !isApiError(e) && count < 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}
