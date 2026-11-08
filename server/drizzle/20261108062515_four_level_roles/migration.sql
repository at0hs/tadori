-- ロールを1人1つの4段階にする（D-64）。drizzle-kit generate の出力に、データの移し替えを足したもの。
-- 1. 1人1行に寄せる：古い5つのロールのうち一番上のもの（admin > approver > author = executor > viewer）だけ残す
DELETE FROM "user_roles" r USING "user_roles" s
WHERE r."user_id" = s."user_id" AND (
  (CASE s."role" WHEN 'admin' THEN 0 WHEN 'approver' THEN 1 WHEN 'author' THEN 2 WHEN 'executor' THEN 2 ELSE 3 END)
  < (CASE r."role" WHEN 'admin' THEN 0 WHEN 'approver' THEN 1 WHEN 'author' THEN 2 WHEN 'executor' THEN 2 ELSE 3 END)
  OR (r."role" = 'executor' AND s."role" = 'author'));--> statement-breakpoint
-- 2. 古い check を外して値を読み替える（author・executor → worker）
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_check";--> statement-breakpoint
UPDATE "user_roles" SET "role" = 'worker' WHERE "role" IN ('author', 'executor');--> statement-breakpoint
-- 3. 列の名前を変え、主キーを (user_id) にする
ALTER TABLE "user_roles" RENAME COLUMN "granted_by" TO "updated_by";--> statement-breakpoint
ALTER TABLE "user_roles" RENAME COLUMN "granted_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey";--> statement-breakpoint
ALTER TABLE "user_roles" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
-- 4. 最後にロールを設定した人がない行（初期管理者・復旧のコマンド）は本人にする
UPDATE "user_roles" SET "updated_by" = "user_id" WHERE "updated_by" IS NULL;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "updated_by" SET NOT NULL;--> statement-breakpoint
-- 5. 新しい check
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_check" CHECK (role in ('admin', 'approver', 'worker', 'viewer'));
