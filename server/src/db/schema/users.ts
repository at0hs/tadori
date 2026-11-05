import { ROLES } from "@tadori/shared";
import { sql } from "drizzle-orm";
import { check, primaryKey, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

// ロールの正本（D-33、data-model.md 4.1）。剥奪は行の削除で表す。
export const userRoles = snakeCase.table(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id),
    role: text({ enum: ROLES }).notNull(),
    // 付与した管理者。初期管理者（D-20）と復旧のコマンド（D-51）では null。
    grantedBy: uuid().references(() => user.id),
    grantedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    check("user_roles_role_check", sql.raw(`role in (${ROLES.map((r) => `'${r}'`).join(", ")})`)),
  ],
);
