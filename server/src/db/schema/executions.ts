import { newId } from "@tadori/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { procedures, procedureVersions } from "./procedures.ts";

// 実行・ステップの記録・承認の履歴（data-model.md 4.3、state-transitions.md 3〜5章）。
// 実行は消さないので、外部キーに削除の連鎖を付けない。
// 状態は文字列の列と CHECK 制約で表す（D-27）。

export const executions = snakeCase.table(
  "executions",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    procedureId: uuid()
      .notNull()
      .references(() => procedures.id),
    versionId: uuid()
      .notNull()
      .references(() => procedureVersions.id),
    executorId: uuid()
      .notNull()
      .references(() => user.id),
    status: text({ enum: ["running", "completed", "abnormal", "cancelled"] })
      .notNull()
      .default("running"),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp({ withTimezone: true }),
    cancelledBy: uuid().references(() => user.id),
    cancelReason: text(),
    variablesLockedAt: timestamp({ withTimezone: true }),
    approvalStatus: text({ enum: ["pending", "approved", "rejected"] }),
    approvalDecidedBy: uuid().references(() => user.id),
    approvalDecidedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index().on(t.executorId, t.status),
    index().on(t.procedureId),
    check(
      "executions_status_check",
      sql`status in ('running', 'completed', 'abnormal', 'cancelled')`,
    ),
    check("executions_ended_check", sql`(status = 'running') = (ended_at is null)`),
    check("executions_cancelled_check", sql`(status = 'cancelled') = (cancelled_by is not null)`),
    check(
      "executions_approval_status_check",
      sql`approval_status is null or approval_status in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "executions_approval_ended_check",
      sql`approval_status is null or status in ('completed', 'abnormal')`,
    ),
  ],
);

// 秘密でない変数の値（秘密変数の行は持たない、D-01）。
export const executionVariables = snakeCase.table(
  "execution_variables",
  {
    executionId: uuid()
      .notNull()
      .references(() => executions.id),
    name: text().notNull(),
    value: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.executionId, t.name] })],
);

// ステップの今の状態。開始時に版の全ステップ分を作り、以後は行を増減しない。
export const executionSteps = snakeCase.table(
  "execution_steps",
  {
    executionId: uuid()
      .notNull()
      .references(() => executions.id),
    stepId: uuid().notNull(),
    section: text({ enum: ["main", "rollback"] }).notNull(),
    status: text({ enum: ["pending", "done", "skipped", "failed"] })
      .notNull()
      .default("pending"),
    skipReason: text(),
    updatedBy: uuid().references(() => user.id),
    updatedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.executionId, t.stepId] }),
    check("execution_steps_section_check", sql`section in ('main', 'rollback')`),
    check("execution_steps_status_check", sql`status in ('pending', 'done', 'skipped', 'failed')`),
    check("execution_steps_skip_reason_check", sql`status <> 'skipped' or skip_reason is not null`),
  ],
);

// 状態変更の履歴（F-06）。挿入だけを行う。
export const stepStatusEvents = snakeCase.table(
  "step_status_events",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    executionId: uuid().notNull(),
    stepId: uuid().notNull(),
    fromStatus: text({ enum: ["pending", "done", "skipped", "failed"] }).notNull(),
    toStatus: text({ enum: ["pending", "done", "skipped", "failed"] }).notNull(),
    skipReason: text(),
    changedBy: uuid()
      .notNull()
      .references(() => user.id),
    changedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "step_status_events_step_fk",
      columns: [t.executionId, t.stepId],
      foreignColumns: [executionSteps.executionId, executionSteps.stepId],
    }),
    index().on(t.executionId),
    check(
      "step_status_events_status_check",
      sql`from_status in ('pending', 'done', 'skipped', 'failed') and to_status in ('pending', 'done', 'skipped', 'failed')`,
    ),
  ],
);

// コメント（D-25、D-56）。挿入だけを行う。
export const stepComments = snakeCase.table(
  "step_comments",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    executionId: uuid().notNull(),
    stepId: uuid().notNull(),
    body: text().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "step_comments_step_fk",
      columns: [t.executionId, t.stepId],
      foreignColumns: [executionSteps.executionId, executionSteps.stepId],
    }),
    index().on(t.executionId),
  ],
);

// エビデンス（D-02、D-25）。挿入だけを行う。
export const stepEvidences = snakeCase.table(
  "step_evidences",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    executionId: uuid().notNull(),
    stepId: uuid().notNull(),
    body: text().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "step_evidences_step_fk",
      columns: [t.executionId, t.stepId],
      foreignColumns: [executionSteps.executionId, executionSteps.stepId],
    }),
    index().on(t.executionId),
  ],
);

// 承認の履歴（F-08）。挿入だけを行う。
export const approvalEvents = snakeCase.table(
  "approval_events",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    executionId: uuid()
      .notNull()
      .references(() => executions.id),
    kind: text({ enum: ["requested", "approved", "rejected"] }).notNull(),
    comment: text(),
    actorId: uuid()
      .notNull()
      .references(() => user.id),
    occurredAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index().on(t.executionId),
    check("approval_events_kind_check", sql`kind in ('requested', 'approved', 'rejected')`),
  ],
);
