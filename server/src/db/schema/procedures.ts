import { newId, type ProcedureContent } from "@tadori/shared";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

// 手順書・版・下書き（data-model.md 4.2、state-transitions.md 2章）。

export const PROCEDURE_ROW_STATUSES = ["active", "archived"] as const;

export const procedures = snakeCase.table(
  "procedures",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    status: text({ enum: PROCEDURE_ROW_STATUSES }).notNull().default("active"),
    // 最新の版数。未公開なら null
    latestVersionNo: integer(),
    createdBy: uuid()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    archivedBy: uuid().references(() => user.id),
    archivedAt: timestamp({ withTimezone: true }),
  },
  () => [
    check("procedures_status_check", sql`status in ('active', 'archived')`),
    check(
      "procedures_archived_check",
      sql`(status = 'archived') = (archived_by is not null and archived_at is not null)`,
    ),
    // 未公開の手順書はアーカイブできない（D-29）
    check(
      "procedures_archived_published_check",
      sql`status <> 'archived' or latest_version_no is not null`,
    ),
  ],
);

// 公開済みの版。挿入だけを行い、更新・削除しない（F-03 の AC）。
export const procedureVersions = snakeCase.table(
  "procedure_versions",
  {
    id: uuid().primaryKey().$defaultFn(newId),
    procedureId: uuid()
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    versionNo: integer().notNull(),
    content: jsonb().$type<ProcedureContent>().notNull(),
    changeReason: text().notNull(),
    publishedBy: uuid()
      .notNull()
      .references(() => user.id),
    publishedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.procedureId, t.versionNo)],
);

// 下書き。手順書ごとに最大1つ（主キー）。最初の保存のときに作る（D-28）。
export const procedureDrafts = snakeCase.table("procedure_drafts", {
  procedureId: uuid()
    .primaryKey()
    .references(() => procedures.id, { onDelete: "cascade" }),
  // 元にした版数。新規作成なら null
  baseVersionNo: integer(),
  content: jsonb().$type<ProcedureContent>().notNull(),
  // 楽観ロックの更新番号（D-05）。保存のたびに 1 増やす
  revision: integer().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => user.id),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid()
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
