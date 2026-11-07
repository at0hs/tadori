import type { StartExecutionRequest, StartExecutionResponse } from "@tadori/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { executionSteps, executions, executionVariables } from "../../db/schema/executions.ts";
import { procedureVersions } from "../../db/schema/procedures.ts";
import { AppError } from "../../lib/errors.ts";
import type { Operator } from "../../lib/hono.ts";
import { logOperation } from "../../lib/operation-log.ts";
import { findProcedure } from "../procedures/queries.ts";
import { checkVariables } from "./queries.ts";

// 実行の開始（F-05、state-transitions.md 3.2、api.md 4.4）。実行者ロールの確認はルートで済んでいる。
// 手順書の行をロックしてから確かめるので、公開・アーカイブと同時に来ても古い版からは始まらない（conventions.md 4.2）。

export async function startExecution(
  op: Operator,
  input: StartExecutionRequest,
): Promise<StartExecutionResponse> {
  const { actor } = op;
  const result = await db.transaction(async (tx) => {
    const row = await findProcedure(tx, input.procedureId, { forUpdate: true });
    if (!row) throw new AppError("NOT_FOUND");
    if (row.latestVersionNo === null) {
      // 未公開の手順書は作成者ロールの人にしか見えない（D-34）
      if (!actor.roles.includes("author")) throw new AppError("NOT_FOUND");
      throw new AppError("STATE_CONFLICT", "公開されていない手順書からは実行を開始できません。");
    }
    if (row.status === "archived") {
      throw new AppError("STATE_CONFLICT", "アーカイブした手順書からは実行を開始できません。");
    }
    if (input.versionNo !== row.latestVersionNo) {
      throw new AppError("NOT_LATEST_VERSION", undefined, {
        latestVersionNo: row.latestVersionNo,
      });
    }
    const [version] = await tx
      .select()
      .from(procedureVersions)
      .where(
        and(
          eq(procedureVersions.procedureId, row.id),
          eq(procedureVersions.versionNo, row.latestVersionNo),
        ),
      );
    if (!version) throw new Error("最新の版の行がない");
    checkVariables(version.content, input.variables);

    const [execution] = await tx
      .insert(executions)
      .values({ procedureId: row.id, versionId: version.id, executorId: actor.id })
      .returning({ id: executions.id });
    if (!execution) throw new Error("実行を作れなかった");
    const id = execution.id;

    const variables = Object.entries(input.variables);
    if (variables.length > 0) {
      await tx
        .insert(executionVariables)
        .values(variables.map(([name, value]) => ({ executionId: id, name, value })));
    }
    const steps = [
      ...version.content.steps.map((s) => ({ stepId: s.id, section: "main" as const })),
      ...version.content.rollbackSteps.map((s) => ({ stepId: s.id, section: "rollback" as const })),
    ];
    if (steps.length > 0) {
      await tx.insert(executionSteps).values(steps.map((s) => ({ executionId: id, ...s })));
    }
    return { id, procedureId: row.id, versionNo: version.versionNo };
  });

  logOperation(
    op.meta,
    {
      event: "execution.started",
      actorId: actor.id,
      target: { type: "execution", id: result.id },
      procedureId: result.procedureId,
      versionNo: result.versionNo,
    },
    "実行を開始した",
  );
  return { id: result.id };
}
