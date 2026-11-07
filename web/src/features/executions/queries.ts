import type { StartExecutionRequest, StepStatusChangeRequest } from "@tadori/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

// 実行（api.md 4.4）。操作の後は成功・失敗のどちらでも実行の Query を取り直す
// （STEP_STATUS_CONFLICT・STATE_CONFLICT のときに最新を見せるため）。

const key = ["executions"] as const;

export const executionListQueryOptions = queryOptions({
  queryKey: [...key, "list"],
  queryFn: async () => (await (await api.executions.$get()).json()).executions,
});

export const executionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...key, id],
    queryFn: async () => (await api.executions[":id"].$get({ param: { id } })).json(),
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: key });
}

export function useStartExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartExecutionRequest) =>
      (await api.executions.$post({ json: input })).json(),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["procedures"] }),
      ]),
  });
}

export function useUpdateVariables(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (variables: Record<string, string>) => {
      await api.executions[":id"].variables.$put({ param: { id }, json: { variables } });
    },
    onSettled: invalidate,
  });
}

export function useChangeStepStatus(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ stepId, ...input }: StepStatusChangeRequest & { stepId: string }) => {
      await api.executions[":id"].steps[":stepId"]["status-changes"].$post({
        param: { id, stepId },
        json: input,
      });
    },
    onSettled: invalidate,
  });
}

export function useAddComment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ stepId, body }: { stepId: string; body: string }) => {
      await api.executions[":id"].steps[":stepId"].comments.$post({
        param: { id, stepId },
        json: { body },
      });
    },
    onSettled: invalidate,
  });
}

export function useAddEvidence(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ stepId, body }: { stepId: string; body: string }) => {
      await api.executions[":id"].steps[":stepId"].evidences.$post({
        param: { id, stepId },
        json: { body },
      });
    },
    onSettled: invalidate,
  });
}

export function useFinishExecution(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => (await api.executions[":id"].finish.$post({ param: { id } })).json(),
    onSettled: invalidate,
  });
}

export function useCancelExecution(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (reason: string) => {
      await api.executions[":id"].cancel.$post({ param: { id }, json: { reason } });
    },
    onSettled: invalidate,
  });
}
