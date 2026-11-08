import { ROLES } from "@tadori/shared";
import { sql } from "drizzle-orm";
import { check, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

// ロールの正本（D-33、D-64、data-model.md 4.1）。1人1行で、ロールを1つだけ持つ。
// 行がないユーザー（作成の途中で失敗した人）は閲覧者として扱う。ロールの上下は DB に持たず、
// shared の PERMISSIONS に持つ。
export const userRoles = snakeCase.table(
  "user_roles",
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id),
    role: text({ enum: ROLES }).notNull(),
    // 最後にロールを設定した管理者。初期管理者（D-20）と復旧のコマンド（D-51）では本人。
    updatedBy: uuid()
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  () => [
    check("user_roles_role_check", sql.raw(`role in (${ROLES.map((r) => `'${r}'`).join(", ")})`)),
  ],
);
