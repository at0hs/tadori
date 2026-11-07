import type { FieldError, ProcedureContent } from "@tadori/shared";
import { and, eq } from "drizzle-orm";
import { user } from "../../db/schema/auth.ts";
import { executions } from "../../db/schema/executions.ts";
import { userRoles } from "../../db/schema/users.ts";
import { AppError } from "../../lib/errors.ts";
import type { Actor } from "../../lib/hono.ts";
import type { Executor, Tx } from "../procedures/queries.ts";

// 実行の読み出しと確認のうち、複数のサービスで共有するもの。

export type ExecutionRow = typeof executions.$inferSelect;

/** 実行の行をロックして返す（conventions.md 4.2）。なければ NOT_FOUND。 */
export async function lockExecution(tx: Tx, id: string): Promise<ExecutionRow> {
  const [row] = await tx.select().from(executions).where(eq(executions.id, id)).for("update");
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/**
 * 実行を操作できるのは本人だけ（D-35）。実行者ロールの確認はルートの requireRole で済んでいる。
 */
export function assertOwner(actor: Actor, row: ExecutionRow) {
  if (row.executorId !== actor.id || !actor.roles.includes("executor")) {
    throw new AppError("FORBIDDEN", "この実行を操作できるのは実行者本人だけです。");
  }
}

/**
 * 実行者が自分の実行をもう操作できないか（無効化された、または実行者ロールがない）。
 * そうなって初めて、管理者が中止できる（D-36）。
 */
export async function executorBlocked(ex: Executor, executorId: string): Promise<boolean> {
  const [row] = await ex.select({ banned: user.banned }).from(user).where(eq(user.id, executorId));
  if (!row || row.banned === true) return true;
  const roles = await ex
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, executorId), eq(userRoles.role, "executor")));
  return roles.length === 0;
}

/**
 * 秘密でない変数の値を、版の文書の変数定義と照合する（api.md 4.4、D-01）。
 * 秘密変数の値・文書にない変数・欠けている値は VALIDATION_FAILED。
 */
export function checkVariables(content: ProcedureContent, values: Record<string, string>) {
  const defs = new Map(content.variables.map((v) => [v.name, v]));
  const errors: FieldError[] = [];
  for (const name of Object.keys(values)) {
    const def = defs.get(name);
    if (!def) {
      errors.push({ path: `variables.${name}`, message: "この手順書にない変数です。" });
    } else if (def.secret) {
      errors.push({ path: `variables.${name}`, message: "秘密変数の値は送らないでください。" });
    }
  }
  for (const def of content.variables) {
    if (!def.secret && !(def.name in values)) {
      errors.push({ path: `variables.${def.name}`, message: "値を入力してください。" });
    }
  }
  if (errors.length > 0) throw new AppError("VALIDATION_FAILED", undefined, { errors });
}
